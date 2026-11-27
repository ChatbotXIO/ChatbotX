import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findOwnerUserIdByWorkspaceId: vi.fn(),
  resetAfterAuthChange: vi.fn(),
}))

const tx = { kind: "tx" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
      await run(tx),
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  aiHandoverBulkRunRepository: {},
  aiHandoverSettingsRepository: {},
  connectionRepository: {},
  inboxRepository: {},
}))
vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))
vi.mock("../src/inbox/service", () => ({ inboxService: {} }))
vi.mock("../src/quota-enforcement/service", () => ({
  quotaEnforcementService: {},
}))
vi.mock("../src/resource-deletion-log/service", () => ({
  resourceDeletionLogService: {},
}))
vi.mock("../src/workspace-usage/service", () => ({
  workspaceUsageService: {},
}))
vi.mock("../src/workspace-member/service", () => ({
  workspaceMemberService: {
    findOwnerUserIdByWorkspaceId: mocks.findOwnerUserIdByWorkspaceId,
  },
}))
vi.mock("../src/channel-post/sync-reset", () => ({
  resetChannelPostSyncAfterAuthChange: mocks.resetAfterAuthChange,
}))

const { connectionStateService } = await import(
  "../src/connection/state-service"
)

const auth = {
  authType: "oauth2",
  tokens: { accessToken: "token" },
} as never

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findOwnerUserIdByWorkspaceId.mockResolvedValue("owner-1")
})

describe("connectionStateService.commitReconnect", () => {
  test("resets the post sync on the same transaction, after the auth write", async () => {
    const order: string[] = []
    const writeAuth = vi.fn(() => {
      order.push("writeAuth")
      return Promise.resolve()
    })
    mocks.resetAfterAuthChange.mockImplementation(() => {
      order.push("reset")
      return Promise.resolve(true)
    })
    const reconnectInbox = vi
      .spyOn(connectionStateService, "reconnectInbox")
      .mockImplementation(() => {
        order.push("reconnectInbox")
        return Promise.resolve()
      })

    await connectionStateService.commitReconnect({
      auth,
      inboxId: "7",
      workspaceId: "ws-1",
      writeAuth,
    })

    expect(writeAuth).toHaveBeenCalledWith(tx)
    expect(mocks.resetAfterAuthChange).toHaveBeenCalledWith(
      { inboxId: "7", workspaceId: "ws-1" },
      tx,
    )
    expect(order).toEqual(["writeAuth", "reset", "reconnectInbox"])
    reconnectInbox.mockRestore()
  })

  test("a failing reset aborts the reconnect, so the auth write rolls back with it", async () => {
    mocks.resetAfterAuthChange.mockRejectedValue(new Error("db down"))
    const reconnectInbox = vi
      .spyOn(connectionStateService, "reconnectInbox")
      .mockResolvedValue(undefined as never)

    await expect(
      connectionStateService.commitReconnect({
        auth,
        inboxId: "7",
        workspaceId: "ws-1",
        writeAuth: vi.fn(),
      }),
    ).rejects.toThrow("db down")
    expect(reconnectInbox).not.toHaveBeenCalled()
    reconnectInbox.mockRestore()
  })
})
