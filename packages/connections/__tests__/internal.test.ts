// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Two independent fixes to `internal.ts`'s shared connect-persist helpers:
//
// 1. `subscribeWebhookBestEffort` runs AFTER `connectAndPersist`'s own
//    `db.transaction` has already committed — a subsequent failure (even
//    the fallback "mark degraded" transition) must never surface as a
//    thrown/rejected connect, which the caller would otherwise treat as a
//    failed connect for an operation that had actually already succeeded.
// 2. `connectAndPersist`'s post-persist audit dispatch was gated on
//    `!existing`, so reviving an inactive satellite row in place (reusing
//    the row instead of inserting a new one) silently skipped the audit
//    entry the fresh-insert path writes.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  inboxCreate: vi.fn(),
  dispatchAuditRecordSafely: vi.fn(),
  transition: vi.fn(),
  upsertConnectionRow: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  inboxService: { create: mocks.inboxCreate },
}))

vi.mock("@chatbotx.io/business/audit", () => ({
  dispatchAuditRecordSafely: mocks.dispatchAuditRecordSafely,
}))

vi.mock("@chatbotx.io/business/connection", () => ({
  connectionStateService: { transition: mocks.transition },
  toChannelType: (provider: string) => provider,
  upsertConnectionRow: mocks.upsertConnectionRow,
  withQuotaCompensation: async (
    _input: unknown,
    operation: () => Promise<unknown>,
  ) => await operation(),
  // `internal.ts` re-exports these three unchanged from the same
  // specifier — the re-export must resolve to something even though
  // neither test below exercises them.
  resolveForeignKey: vi.fn(),
  resolveOwnerId: vi.fn(),
  saveOrInsertSatellite: vi.fn(),
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  connectionNotConfiguredException: (provider: string) =>
    new Error(`${provider} not configured`),
  notFoundException: (message: string) => new Error(message),
  validationException: (field: string, message: string) =>
    Object.assign(new Error(message), { field }),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: (fn: (tx: unknown) => unknown) => fn({}) },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: { findByIdForWorkspace: vi.fn() },
}))

vi.mock("../src/registry", () => ({ CONNECTION_REGISTRY: {} }))

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

// Dynamic `import()` is required here, not a static import: the mocks above
// must be registered before `internal.ts` (and its `@chatbotx.io/business`/
// `@chatbotx.io/database` dependencies) are evaluated, which only a
// post-`vi.mock` dynamic import guarantees.
const { subscribeWebhookBestEffort, connectAndPersist } = await import(
  "../src/internal"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("subscribeWebhookBestEffort", () => {
  it("does not rethrow when the webhook subscribe fails and the degrade transition also fails (regression: this previously rethrew after connectAndPersist's own transaction had already committed, surfacing an already-successful connect as a failure)", async () => {
    const connection = { id: "conn-1", provider: "messenger" }
    const adapter = {
      provider: {
        webhook: {
          subscribe: vi.fn().mockRejectedValue(new Error("webhook down")),
        },
      },
    }
    mocks.transition.mockRejectedValue(new Error("transition failed too"))

    await expect(
      subscribeWebhookBestEffort({
        adapter: adapter as never,
        auth: {} as never,
        connection: connection as never,
        ownerId: "owner-1",
      }),
    ).resolves.toBe(connection)

    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-1",
      event: "verify.failed_non_auth",
      reason: "verify_failed",
      ownerId: "owner-1",
    })
  })
})

describe("connectAndPersist — audit on revive", () => {
  it("dispatches the connect audit record even when reviving an existing inactive connection row in place (regression: the audit dispatch was gated on `!existing`, so only a brand-new insert ever audited; reviving a disconnected channel silently skipped it)", async () => {
    const existing = {
      id: "conn-1",
      inboxId: "inbox-1",
      provider: "messenger",
      status: "needs_reauth",
    }
    const revived = { id: "conn-1", provider: "messenger", status: "connected" }
    mocks.upsertConnectionRow.mockResolvedValue(revived)
    const adapter = { provider: { kind: "channel" }, store: {} }

    await connectAndPersist({
      adapter: adapter as never,
      provider: "messenger",
      workspaceId: "ws-1",
      auth: {} as never,
      descriptor: { sourceId: "page-1", displayName: "Page One" },
      extraConfig: {},
      existing: existing as never,
      ownerId: "owner-1",
      actorUserId: "user-1",
      reuseExistingInboxId: true,
      missingOwnerError: new Error("no owner"),
    })

    expect(mocks.inboxCreate).not.toHaveBeenCalled()
    expect(mocks.dispatchAuditRecordSafely).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "ws-1",
        action: "connect",
      }),
      expect.any(String),
    )
  })

  it("still skips the audit dispatch when there is no interactive actor, insert or revive alike", async () => {
    mocks.inboxCreate.mockResolvedValue({ inbox: { id: "inbox-new" } })
    mocks.upsertConnectionRow.mockResolvedValue({
      id: "conn-1",
      provider: "messenger",
      status: "connected",
    })
    const adapter = { provider: { kind: "channel" }, store: {} }

    await connectAndPersist({
      adapter: adapter as never,
      provider: "messenger",
      workspaceId: "ws-1",
      auth: {} as never,
      descriptor: { sourceId: "page-1", displayName: "Page One" },
      extraConfig: {},
      existing: undefined,
      ownerId: "owner-1",
      actorUserId: undefined,
      missingOwnerError: new Error("no owner"),
    })

    expect(mocks.dispatchAuditRecordSafely).not.toHaveBeenCalled()
  })
})
