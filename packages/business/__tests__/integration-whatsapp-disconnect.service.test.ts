import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// integrationWhatsappService.deleteWithCleanup — staging delete uses
// phoneNumberId; the service never emits an audit record (that stays in the
// builder action).
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  tearDownForIntegration: vi.fn(),
  deleteByPhoneNumberId: vi.fn(),
  deleteByIntegration: vi.fn(),
  deleteById: vi.fn(),
  disconnect: vi.fn(),
  auditRecord: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationWhatsappRepository: { deleteById: mocks.deleteById },
  metaCapiEventRepository: { deleteByIntegration: mocks.deleteByIntegration },
  whatsappCoexistStagingRepository: {
    deleteByPhoneNumberId: mocks.deleteByPhoneNumberId,
  },
}))

vi.mock("../src/coexist/service", () => ({
  coexistService: { tearDownForIntegration: mocks.tearDownForIntegration },
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { disconnect: mocks.disconnect },
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.auditRecord,
}))

const { integrationWhatsappService } = await import(
  "../src/integration-whatsapp/service"
)

const tx = { tx: true }

describe("integrationWhatsappService.deleteWithCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(
      async (callback: (client: unknown) => Promise<unknown>) =>
        await callback(tx),
    )
    mocks.tearDownForIntegration.mockResolvedValue(undefined)
    mocks.deleteByPhoneNumberId.mockResolvedValue(undefined)
    mocks.deleteByIntegration.mockResolvedValue(undefined)
    mocks.deleteById.mockResolvedValue(undefined)
    mocks.disconnect.mockResolvedValue(undefined)
  })

  test("scopes the coexist teardown to channel: whatsapp", async () => {
    await integrationWhatsappService.deleteWithCleanup({
      workspaceId: "ws_1",
      id: "iw_1",
      phoneNumberId: "phone_1",
      inboxId: "inbox_1",
      ownerId: "owner_1",
    })

    expect(mocks.tearDownForIntegration).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      integrationId: "iw_1",
      channel: "whatsapp",
      currentError: "Integration disconnected",
      tx,
    })
  })

  test("deletes coexist staging rows scoped by phoneNumberId", async () => {
    await integrationWhatsappService.deleteWithCleanup({
      workspaceId: "ws_1",
      id: "iw_1",
      phoneNumberId: "phone_1",
      inboxId: "inbox_1",
      ownerId: "owner_1",
    })

    expect(mocks.deleteByPhoneNumberId).toHaveBeenCalledWith(
      { phoneNumberId: "phone_1" },
      tx,
    )
  })

  test("never emits an audit record — that stays in the builder action", async () => {
    await integrationWhatsappService.deleteWithCleanup({
      workspaceId: "ws_1",
      id: "iw_1",
      phoneNumberId: "phone_1",
      inboxId: "inbox_1",
      ownerId: "owner_1",
    })

    expect(mocks.auditRecord).not.toHaveBeenCalled()
  })

  test("cleans up the integration row and disconnects the inbox", async () => {
    await integrationWhatsappService.deleteWithCleanup({
      workspaceId: "ws_1",
      id: "iw_1",
      phoneNumberId: "phone_1",
      inboxId: "inbox_1",
      ownerId: "owner_1",
    })

    expect(mocks.deleteByIntegration).toHaveBeenCalledWith(
      { workspaceId: "ws_1", channel: "whatsapp", integrationId: "iw_1" },
      tx,
    )
    expect(mocks.deleteById).toHaveBeenCalledWith({ id: "iw_1" }, tx)
    expect(mocks.disconnect).toHaveBeenCalledWith({
      inboxId: "inbox_1",
      ownerId: "owner_1",
      workspaceId: "ws_1",
      tx,
    })
  })
})
