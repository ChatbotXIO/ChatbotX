// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auditRecord: vi.fn().mockResolvedValue(undefined),
  deleteWithCleanup: vi.fn().mockResolvedValue(undefined),
  findByIdForWorkspace: vi.fn(),
  isRevokedTokenError: vi.fn(() => false),
  whatsappDisconnect: vi.fn().mockResolvedValue(undefined),
  workspaceFindById: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationWhatsappService: {
    deleteWithCleanup: mocks.deleteWithCleanup,
    findByIdForWorkspace: mocks.findByIdForWorkspace,
  },
  workspaceService: { findById: mocks.workspaceFindById },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: mocks.auditRecord },
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
    mocks.findByIdForWorkspace.mockResolvedValue(integrationWhatsappRow)
    mocks.workspaceFindById.mockResolvedValue({
      id: "workspace-1",
      ownerId: "owner-1",
    })
    mocks.whatsappDisconnect.mockResolvedValue(undefined)
    mocks.isRevokedTokenError.mockReturnValue(false)
    mocks.deleteWithCleanup.mockResolvedValue(undefined)
  })

  test("delegates cleanup to integrationWhatsappService.deleteWithCleanup with the phoneNumberId", async () => {
    await (disconnectWhatsappAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: ["workspace-1", "whatsapp-1"],
    })

    expect(mocks.deleteWithCleanup).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "whatsapp-1",
      phoneNumberId: "phone-1",
      inboxId: "inbox-1",
      ownerId: "owner-1",
    })
  })

  test("still disconnects the integration when the provider token is already revoked", async () => {
    mocks.whatsappDisconnect.mockRejectedValueOnce(new Error("revoked"))
    mocks.isRevokedTokenError.mockReturnValue(true)

    await (disconnectWhatsappAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: ["workspace-1", "whatsapp-1"],
    })

    expect(mocks.deleteWithCleanup).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "whatsapp-1",
      phoneNumberId: "phone-1",
      inboxId: "inbox-1",
      ownerId: "owner-1",
    })
  })

  test("records the workspace-less audit event after cleanup resolves", async () => {
    await (disconnectWhatsappAction as (props: unknown) => Promise<unknown>)({
      bindArgsParsedInputs: ["workspace-1", "whatsapp-1"],
    })

    expect(mocks.auditRecord).toHaveBeenCalledWith({
      action: "disconnect",
      detail: "disconnected the WhatsApp channel (#whatsapp-1)",
    })
  })
})
