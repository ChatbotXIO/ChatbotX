import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// deleteInstagramIntegrationWithCleanup — isFacebook: true skips coexist
// teardown (the Facebook-mediated variant never has coexist runs); false
// calls it.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  tearDownForIntegration: vi.fn(),
  deleteByIntegration: vi.fn(),
  deleteById: vi.fn(),
  disconnect: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationInstagramRepository: { deleteById: mocks.deleteById },
  metaCapiEventRepository: { deleteByIntegration: mocks.deleteByIntegration },
}))

vi.mock("../src/coexist/service", () => ({
  coexistService: { tearDownForIntegration: mocks.tearDownForIntegration },
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { disconnect: mocks.disconnect },
}))

const { deleteInstagramIntegrationWithCleanup } = await import(
  "../src/integration-instagram/disconnect"
)

const tx = { tx: true }

describe("deleteInstagramIntegrationWithCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.transaction.mockImplementation(
      async (callback: (client: unknown) => Promise<unknown>) =>
        await callback(tx),
    )
    mocks.tearDownForIntegration.mockResolvedValue(undefined)
    mocks.deleteByIntegration.mockResolvedValue(undefined)
    mocks.deleteById.mockResolvedValue(undefined)
    mocks.disconnect.mockResolvedValue(undefined)
  })

  test("isFacebook: false calls coexist teardown", async () => {
    await deleteInstagramIntegrationWithCleanup({
      workspaceId: "ws_1",
      id: "ig_1",
      inboxId: "inbox_1",
      ownerId: "owner_1",
      isFacebook: false,
    })

    expect(mocks.tearDownForIntegration).toHaveBeenCalledWith({
      workspaceId: "ws_1",
      integrationId: "ig_1",
      channel: "instagram",
      currentError: "Integration disconnected",
      tx,
    })
  })

  test("isFacebook: true skips coexist teardown", async () => {
    await deleteInstagramIntegrationWithCleanup({
      workspaceId: "ws_1",
      id: "ig_1",
      inboxId: "inbox_1",
      ownerId: "owner_1",
      isFacebook: true,
    })

    expect(mocks.tearDownForIntegration).not.toHaveBeenCalled()
    // The rest of the cleanup still runs regardless of channel type.
    expect(mocks.deleteByIntegration).toHaveBeenCalledWith(
      { workspaceId: "ws_1", channel: "instagram", integrationId: "ig_1" },
      tx,
    )
    expect(mocks.deleteById).toHaveBeenCalledWith({ id: "ig_1" }, tx)
    expect(mocks.disconnect).toHaveBeenCalledWith({
      inboxId: "inbox_1",
      ownerId: "owner_1",
      workspaceId: "ws_1",
      tx,
    })
  })
})
