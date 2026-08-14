// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const txChain = {
    set: vi.fn(),
    where: vi.fn(),
  }
  txChain.set.mockReturnValue(txChain)
  txChain.where.mockResolvedValue(undefined)

  const tx = {
    update: vi.fn(() => txChain),
    delete: vi.fn(() => txChain),
  }

  return {
    dbTransaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) =>
      callback(tx),
    ),
    findOrFail: vi.fn(),
    inboxDisconnect: vi.fn().mockResolvedValue(undefined),
    isRevokedTokenError: vi.fn(() => false),
    metaCapiDeleteByIntegration: vi.fn().mockResolvedValue(undefined),
    tx,
    txChain,
    whatsappDisconnect: vi.fn().mockResolvedValue(undefined),
    workspaceFindById: vi.fn(),
  }
})

vi.mock("@chatbotx.io/business", () => ({
  inboxService: { disconnect: mocks.inboxDisconnect },
  workspaceService: { findById: mocks.workspaceFindById },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  db: { transaction: mocks.dbTransaction },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  findOrFail: mocks.findOrFail,
  inArray: vi.fn((field: unknown, values: unknown[]) => ({ field, values })),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  metaCapiEventRepository: {
    deleteByIntegration: mocks.metaCapiDeleteByIntegration,
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  coexistSyncRunModel: {
    finishedAt: "finishedAt",
    integrationId: "integrationId",
    status: "status",
  },
  integrationWhatsappModel: { id: "whatsappId" },
  whatsappCoexistStagingModel: { phoneNumberId: "phoneNumberId" },
}))

vi.mock("@chatbotx.io/integration-whatsapp", () => ({
  isRevokedTokenError: mocks.isRevokedTokenError,
}))

vi.mock("@/features/common/schemas", () => ({
  workspaceIdAndIdRequestParams: [],
}))

vi.mock("@/integration", () => ({
  integrations: {
    whatsapp: { disconnect: mocks.whatsappDisconnect },
  },
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.action = (fn: unknown) => fn
  return {
    workspaceActionClientAllowExpired: chain,
  }
})

const { disconnectWhatsappAction } = await import(
  "../src/features/integration-whatsapp/actions/disconnect.action"
)

const integrationWhatsappRow = {
  id: "whatsapp-1",
  auth: { clientId: "client-1" },
  inboxId: "inbox-1",
  phoneNumberId: "phone-1",
}

describe("disconnectWhatsappAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.dbTransaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<void>) => callback(mocks.tx),
    )
    mocks.findOrFail.mockResolvedValue(integrationWhatsappRow)
    mocks.workspaceFindById.mockResolvedValue({
      id: "workspace-1",
      ownerId: "owner-1",
    })
    mocks.whatsappDisconnect.mockResolvedValue(undefined)
    mocks.isRevokedTokenError.mockReturnValue(false)
  })

  test("purges MetaCapiEvent rows for the whatsapp channel before deleting the integration", async () => {
    await (disconnectWhatsappAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: ["workspace-1", "whatsapp-1"],
    })

    expect(mocks.metaCapiDeleteByIntegration).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        channel: "whatsapp",
        integrationId: "whatsapp-1",
      },
      mocks.tx,
    )
    expect(mocks.tx.delete).toHaveBeenCalledWith({ id: "whatsappId" })
    expect(mocks.inboxDisconnect).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      ownerId: "owner-1",
      workspaceId: "workspace-1",
      tx: mocks.tx,
    })
  })

  test("still disconnects the integration when the provider token is already revoked", async () => {
    mocks.whatsappDisconnect.mockRejectedValueOnce(new Error("revoked"))
    mocks.isRevokedTokenError.mockReturnValue(true)

    await (disconnectWhatsappAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: ["workspace-1", "whatsapp-1"],
    })

    expect(mocks.metaCapiDeleteByIntegration).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-1",
        channel: "whatsapp",
        integrationId: "whatsapp-1",
      },
      mocks.tx,
    )
  })
})
