import { beforeEach, expect, test, vi } from "vitest"
import { refresh } from "../src/lifecycle"

const mocks = vi.hoisted(() => ({
  ensureFreshAuth: vi.fn(),
  findById: vi.fn(),
  findOrThrow: vi.fn(),
  loadAuthByForeignKey: vi.fn(),
  recordAuthSaved: vi.fn(),
  resolveAdapter: vi.fn(),
  resolveForeignKey: vi.fn(),
  resolveOwnerId: vi.fn(),
  runExclusive: vi.fn((input: { fn: () => Promise<unknown> }) => input.fn()),
  saveAuthByForeignKey: vi.fn(),
}))

vi.mock("@chatbotx.io/business/connection", () => ({
  authExpiresAtOf: vi.fn(() => null),
  connectionStateService: {
    markUnhealthy: vi.fn(),
    recordAuthSaved: mocks.recordAuthSaved,
  },
  InvalidConnectionTransitionException: Error,
  isActiveConnectionStatus: vi.fn(() => true),
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  connectionInactiveException: vi.fn(() => new Error("inactive")),
  connectionNotConfiguredException: vi.fn(() => new Error("not configured")),
  connectionNotRefreshableException: vi.fn(() => new Error("not refreshable")),
  notFoundException: vi.fn(() => new Error("not found")),
  toPublicErrorMessage: vi.fn(() => "error"),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: vi.fn() },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: { findById: mocks.findById },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
}))

vi.mock("../src/internal", () => ({
  findOrThrow: mocks.findOrThrow,
  resolveAdapter: mocks.resolveAdapter,
  resolveForeignKey: mocks.resolveForeignKey,
  resolveOwnerId: mocks.resolveOwnerId,
}))

vi.mock("../src/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}))

const connection = {
  id: "conn-1",
  inboxId: "inbox-1",
  integrationId: null,
  provider: "messenger",
  status: "connected",
  workspaceId: "ws-1",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findOrThrow.mockResolvedValue(connection)
  mocks.findById.mockResolvedValue(connection)
  mocks.loadAuthByForeignKey.mockResolvedValue({ authType: "none" })
  mocks.resolveForeignKey.mockReturnValue("inbox-1")
  mocks.resolveOwnerId.mockResolvedValue("owner-1")
  mocks.resolveAdapter.mockReturnValue({
    integration: {
      ensureFreshAuth: mocks.ensureFreshAuth,
      refreshAuth: vi.fn(),
    },
    store: {
      loadAuthByForeignKey: mocks.loadAuthByForeignKey,
      saveAuthByForeignKey: mocks.saveAuthByForeignKey,
    },
  })
  mocks.ensureFreshAuth.mockImplementation(
    async (context: {
      authStore: { withLock?: (fn: () => Promise<void>) => Promise<void> }
    }) => await context.authStore.withLock?.(async () => undefined),
  )
})

test("manual refresh serializes with worker refreshes on the connection lock", async () => {
  await expect(
    refresh({ connectionId: "conn-1", workspaceId: "ws-1" }),
  ).resolves.toEqual(connection)

  expect(mocks.runExclusive).toHaveBeenCalledWith(
    expect.objectContaining({
      key: "auth:refresh:connection:conn-1",
      timeoutInSeconds: 10,
    }),
  )
})
