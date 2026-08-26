import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  insert: vi.fn(),
  connectChannelIntegration: vi.fn(),
  dispatchAuditRecord: vi.fn(),
  createId: vi.fn(() => "api-1"),
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))

vi.mock("../src/inbox/connect-channel", () => ({
  connectChannelIntegration: mocks.connectChannelIntegration,
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: { disconnect: vi.fn() },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: mocks.transaction },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  integrationTypes: { enum: { api: "api" } },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  integrationApiRepository: { insert: mocks.insert },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mocks.createId,
}))

const { integrationApiService } = await import("../src/integration-api/service")

describe("integrationApiService.connect", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createId.mockReturnValue("api-1")
    mocks.insert.mockResolvedValue({ id: "api-1" })
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({ tx: true }),
    )
    mocks.connectChannelIntegration.mockResolvedValue({
      integration: { id: "api-1" },
    })
  })

  test("uses actorUserId, not ownerId, for API channel audit records", async () => {
    await integrationApiService.connect({
      ownerId: "owner-1",
      actorUserId: "admin-1",
      workspaceId: "workspace-1",
      name: "Support API",
      auth: { authType: "custom", signingSecret: "secret" },
      tokenHash: "hash",
      tokenPrefix: "prefix",
      callbackUrl: null,
    })

    expect(mocks.connectChannelIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner-1",
      }),
    )
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledTimes(1)
    expect(mocks.dispatchAuditRecord).toHaveBeenCalledWith({
      userId: "admin-1",
      workspaceId: "workspace-1",
      action: "create",
      detail: "created a new API key (#api-1)",
    })
  })

  test("uses actorUserId for both workspace and API key audit rows", async () => {
    await integrationApiService.connect({
      ownerId: "owner-1",
      actorUserId: "owner-1",
      name: "New Workspace API",
      auth: { authType: "custom", signingSecret: "secret" },
      tokenHash: "hash",
      tokenPrefix: "prefix",
      callbackUrl: "https://example.com/callback",
      createWorkspace: async () => "workspace-2",
    })

    expect(mocks.dispatchAuditRecord).toHaveBeenCalledTimes(2)
    expect(mocks.dispatchAuditRecord).toHaveBeenNthCalledWith(1, {
      userId: "owner-1",
      workspaceId: "workspace-2",
      action: "create",
      detail: "created the workspace (#workspace-2)",
    })
    expect(mocks.dispatchAuditRecord).toHaveBeenNthCalledWith(2, {
      userId: "owner-1",
      workspaceId: "workspace-2",
      action: "create",
      detail: "created a new API key (#api-1)",
    })
  })
})
