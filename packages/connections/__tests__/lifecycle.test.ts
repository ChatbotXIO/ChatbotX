import { beforeEach, describe, expect, test, vi } from "vitest"
import { disconnect, refresh } from "../src/lifecycle"

const mocks = vi.hoisted(() => ({
  deleteRowByForeignKey: vi.fn(),
  ensureFreshAuth: vi.fn(),
  findById: vi.fn(),
  findOrThrow: vi.fn(),
  integrationDisconnect: vi.fn(),
  loadAuthByForeignKey: vi.fn(),
  recordAuthSaved: vi.fn(),
  resolveAdapter: vi.fn(),
  resolveForeignKey: vi.fn(),
  resolveOwnerId: vi.fn(),
  releasePendingQuota: vi.fn(),
  runExclusive: vi.fn((input: { fn: () => Promise<unknown> }) => input.fn()),
  saveAuthByForeignKey: vi.fn(),
  teardown: vi.fn(),
  transition: vi.fn(),
  tx: { marker: "tx" },
  update: vi.fn(),
  webhookUnsubscribe: vi.fn(),
  withinTransaction: vi.fn(),
}))

vi.mock("@chatbotx.io/business/connection", () => ({
  authExpiresAtOf: vi.fn(() => null),
  connectionStateService: {
    markUnhealthy: vi.fn(),
    recordAuthSaved: mocks.recordAuthSaved,
    releasePendingQuota: mocks.releasePendingQuota,
    transition: mocks.transition,
  },
  InvalidConnectionTransitionException: Error,
  isActiveConnectionStatus: vi.fn(() => true),
  resolveForeignKey: mocks.resolveForeignKey,
  resolveOwnerId: mocks.resolveOwnerId,
}))

vi.mock("@chatbotx.io/business/errors", async (importOriginal) => {
  // `toPublicErrorMessage` is pulled from the real module (not stubbed) so
  // these tests exercise its actual sanitization/fallback behavior instead
  // of a fixed literal — see the "sanitizes a provider-side teardown
  // failure" tests below.
  const actual =
    await importOriginal<typeof import("@chatbotx.io/business/errors")>()
  return {
    connectionInactiveException: vi.fn(() => new Error("inactive")),
    connectionNotConfiguredException: vi.fn(() => new Error("not configured")),
    connectionNotRefreshableException: vi.fn(
      () => new Error("not refreshable"),
    ),
    notFoundException: vi.fn(() => new Error("not found")),
    toPublicErrorMessage: actual.toPublicErrorMessage,
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback(mocks.tx),
    ),
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: { findById: mocks.findById, update: mocks.update },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
}))

vi.mock("../src/internal", () => ({
  findOrThrow: mocks.findOrThrow,
  resolveAdapter: mocks.resolveAdapter,
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

describe("disconnect", () => {
  const messengerAuth = { authType: "none" as const }

  beforeEach(() => {
    mocks.resolveAdapter.mockReturnValue({
      integration: { disconnect: mocks.integrationDisconnect },
      provider: { webhook: { unsubscribe: mocks.webhookUnsubscribe } },
      store: {
        loadAuthByForeignKey: mocks.loadAuthByForeignKey,
        deleteRowByForeignKey: mocks.deleteRowByForeignKey,
      },
      teardown: mocks.teardown,
    })
    mocks.loadAuthByForeignKey.mockResolvedValue(messengerAuth)
    mocks.transition.mockResolvedValue(connection)
    mocks.teardown.mockResolvedValue({
      skipGenericRemoteTeardown: true,
      withinTransaction: mocks.withinTransaction,
    })
  })

  // The engine's generic `DELETE /v1/connections/{id}` path defers to the
  // adapter's `teardown` hook (Messenger's shared-Page-webhook preservation,
  // coexist teardown, `MetaCapiEvent`/tag cleanup — see
  // `messenger-teardown.ts`) instead of always running the generic
  // `integration.disconnect` + `provider.webhook.unsubscribe` + store-row-
  // delete sequence.
  test("messenger disconnect runs the adapter's teardown hook instead of the generic remote teardown", async () => {
    await disconnect({ connectionId: "conn-1", workspaceId: "ws-1" })

    expect(mocks.teardown).toHaveBeenCalledWith({
      connection,
      auth: messengerAuth,
    })
    expect(mocks.withinTransaction).toHaveBeenCalledWith(mocks.tx)
    expect(mocks.integrationDisconnect).not.toHaveBeenCalled()
    expect(mocks.webhookUnsubscribe).not.toHaveBeenCalled()
  })

  test("falls back to the generic remote teardown when the hook doesn't skip it", async () => {
    mocks.teardown.mockResolvedValue({
      skipGenericRemoteTeardown: false,
      withinTransaction: mocks.withinTransaction,
    })

    await disconnect({ connectionId: "conn-1", workspaceId: "ws-1" })

    expect(mocks.integrationDisconnect).toHaveBeenCalledWith(messengerAuth)
    expect(mocks.webhookUnsubscribe).toHaveBeenCalledWith({
      auth: messengerAuth,
    })
    expect(mocks.withinTransaction).toHaveBeenCalledWith(mocks.tx)
  })

  test("persists a provider-side teardown failure to Connection.lastError instead of failing the disconnect", async () => {
    mocks.teardown.mockRejectedValue(new Error("Graph API down"))

    const result = await disconnect({
      connectionId: "conn-1",
      workspaceId: "ws-1",
    })

    expect(result).toBe(connection)
    // `toPublicErrorMessage` is the real implementation here (see the
    // `@chatbotx.io/business/errors` mock above): a plain `Error` is not a
    // `ChatbotXException`, so it always collapses to the call site's
    // fallback string rather than leaking the thrown message verbatim.
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "conn-1",
        values: { lastError: "Provider-side teardown failed" },
      }),
      mocks.tx,
    )
  })

  test("sanitizes a provider-side teardown failure before persisting it as Connection.lastError", async () => {
    // Exercises the generic `adapter.integration.disconnect` teardown step
    // (needs `skipGenericRemoteTeardown: false` so it actually runs).
    mocks.teardown.mockResolvedValue({
      skipGenericRemoteTeardown: false,
      withinTransaction: mocks.withinTransaction,
    })
    const sensitiveMessage =
      "Postgres connection string: postgres://user:pass@host/db"
    mocks.integrationDisconnect.mockRejectedValue(new Error(sensitiveMessage))

    await disconnect({ connectionId: "conn-1", workspaceId: "ws-1" })

    const [updateArgs] = mocks.update.mock.calls.at(-1) as [
      { values: { lastError: string } },
    ]
    // Raw internal text never reaches the persisted `lastError` …
    expect(updateArgs.values.lastError).not.toContain(sensitiveMessage)
    expect(updateArgs.values.lastError).not.toContain("user:pass")
    // … it is replaced by the real `toPublicErrorMessage` fallback for a
    // plain (non-`ChatbotXException`) `Error`.
    expect(updateArgs.values.lastError).toBe("Provider-side teardown failed")
  })

  test("never releases the pending quota when the transaction rolls back", async () => {
    mocks.update.mockResolvedValue(connection)
    mocks.withinTransaction.mockRejectedValue(new Error("constraint violation"))

    await expect(
      disconnect({ connectionId: "conn-1", workspaceId: "ws-1" }),
    ).rejects.toThrow("constraint violation")

    expect(mocks.releasePendingQuota).not.toHaveBeenCalled()
  })
})
