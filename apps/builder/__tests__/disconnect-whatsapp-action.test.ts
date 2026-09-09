// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const LIVE_RUN_STATUSES = ["init", "running", "waiting"]

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

// Mirrors `integrationWhatsappService.disconnect`'s real transaction body —
// the test asserts on these same tx calls, so the mock replicates them
// rather than mocking `@chatbotx.io/business` transitively (which would
// require booting the real business/database module graph).
const integrationWhatsappServiceDisconnect = vi.fn(
  async (props: {
    integrationWhatsapp: { id: string; inboxId: string; phoneNumberId: string }
    ownerId: string
    workspaceId: string
    tx: typeof mocks.tx
  }) => {
    const tx = props.tx as unknown as {
      update: (arg?: unknown) => {
        set: (arg?: unknown) => { where: (arg?: unknown) => unknown }
      }
      delete: (arg?: unknown) => unknown
    }

    tx.update()
      .set()
      .where({
        conditions: [
          { field: "integrationId", value: props.integrationWhatsapp.id },
          { field: "status", values: LIVE_RUN_STATUSES },
        ],
      })
    tx.delete()
    await mocks.metaCapiDeleteByIntegration(
      {
        workspaceId: props.workspaceId,
        channel: "whatsapp",
        integrationId: props.integrationWhatsapp.id,
      },
      props.tx,
    )
    tx.delete({ id: "whatsappId" })
    await mocks.inboxDisconnect({
      inboxId: props.integrationWhatsapp.inboxId,
      ownerId: props.ownerId,
      workspaceId: props.workspaceId,
      reason: "manual",
      tx: props.tx,
    })
  },
)

vi.mock("@chatbotx.io/business", () => ({
  integrationWhatsappService: {
    disconnect: integrationWhatsappServiceDisconnect,
  },
  workspaceService: { findById: mocks.workspaceFindById },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.dbTransaction },
  findOrFail: mocks.findOrFail,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  integrationWhatsappModel: { id: "whatsappId" },
}))

vi.mock("@chatbotx.io/integration-whatsapp", () => ({
  isRevokedTokenError: mocks.isRevokedTokenError,
}))

vi.mock("@/features/common/schema", () => ({
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
      reason: "manual",
      tx: mocks.tx,
    })
  })

  // A WhatsApp coexist run parked in `waiting` survived disconnect,
  // and pass 1 could not revive it (its staging join to IntegrationWhatsapp is
  // gone), so it lingered until the 24h timeout closed it `history_timeout`.
  test("abandons coexist runs in waiting as well as init/running", async () => {
    await (disconnectWhatsappAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: ["workspace-1", "whatsapp-1"],
    })

    const statusFilters = mocks.txChain.where.mock.calls
      .flatMap((args) => {
        const condition = args[0] as { conditions?: unknown[] } | undefined
        return condition?.conditions ?? []
      })
      .filter(
        (condition): condition is { field: unknown; values: string[] } =>
          typeof condition === "object" &&
          condition !== null &&
          "values" in condition,
      )
      .map((condition) => condition.values)

    expect(statusFilters).toContainEqual(["init", "running", "waiting"])
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
