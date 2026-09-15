import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  execute: vi.fn(async () => ({ rows: [{ auth: { authType: "none" } }] })),
  runExclusive: vi.fn((input: { fn: () => unknown }) => input.fn()),
  findByInboxId: vi.fn(),
  findByIntegrationId: vi.fn(),
  inboxUpdate: vi.fn(),
  inboxUpdateSet: vi.fn(),
  inboxUpdateWhere: vi.fn(),
  markUnhealthy: vi.fn(async () => undefined),
  recordAuthSaved: vi.fn(async () => undefined),
  transition: vi.fn(async () => undefined),
  findOwnerUserIdByWorkspaceId: vi.fn(async () => "owner-1"),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    execute: mocks.execute,
    update: mocks.inboxUpdate,
  },
  eq: vi.fn((column, value) => ({ column, value })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
    { identifier: (name: string) => name },
  ),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: {
    findByInboxId: mocks.findByInboxId,
    findByIntegrationId: mocks.findByIntegrationId,
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  inboxModel: { id: "id" },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: { runExclusive: mocks.runExclusive },
}))

vi.mock("../../connection/state-service", () => ({
  connectionStateService: {
    markUnhealthy: mocks.markUnhealthy,
    recordAuthSaved: mocks.recordAuthSaved,
    transition: mocks.transition,
  },
}))

vi.mock("../../workspace-member/service", () => ({
  workspaceMemberService: {
    findOwnerUserIdByWorkspaceId: mocks.findOwnerUserIdByWorkspaceId,
  },
}))

const { makeAuthStore } = await import("../auth-store")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.inboxUpdate.mockReturnValue({ set: mocks.inboxUpdateSet })
  mocks.inboxUpdateSet.mockReturnValue({ where: mocks.inboxUpdateWhere })
  mocks.execute.mockResolvedValue({ rows: [{ auth: { authType: "none" } }] })
  mocks.findOwnerUserIdByWorkspaceId.mockResolvedValue("owner-1")
})

describe("makeAuthStore.save", () => {
  it("mirrors authExpiresAt onto the Connection row for an oauth2 auth", async () => {
    mocks.findByInboxId.mockResolvedValue({
      id: "conn-1",
      workspaceId: "ws-1",
    })
    const store = makeAuthStore("messenger", {
      id: "row-1",
      inboxId: "inbox-1",
    })
    await store.save({
      authType: "oauth2",
      clientId: "c",
      clientSecret: "s",
      redirectUrl: "r",
      tokens: { accessToken: "tok", expiresAt: "2030-01-01T00:00:00.000Z" },
    })
    expect(mocks.recordAuthSaved).toHaveBeenCalledWith({
      connectionId: "conn-1",
      authExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    })
  })

  it("records a null authExpiresAt for a non-oauth2 auth", async () => {
    mocks.findByInboxId.mockResolvedValue({
      id: "conn-1",
      workspaceId: "ws-1",
    })
    const store = makeAuthStore("smtp", { id: "row-1", inboxId: "inbox-1" })
    await store.save({ authType: "none" })
    expect(mocks.recordAuthSaved).toHaveBeenCalledWith({
      connectionId: "conn-1",
      authExpiresAt: null,
    })
  })

  it("skips the Connection mirror when no matching row exists (pre-backfill)", async () => {
    mocks.findByInboxId.mockResolvedValue(undefined)
    const store = makeAuthStore("messenger", {
      id: "row-1",
      inboxId: "inbox-1",
    })
    await store.save({ authType: "none" })
    expect(mocks.recordAuthSaved).not.toHaveBeenCalled()
  })
})

describe("makeAuthStore.markOffline", () => {
  it("routes through connectionStateService.markUnhealthy with the resolved owner", async () => {
    mocks.findByInboxId.mockResolvedValue({
      id: "conn-1",
      workspaceId: "ws-1",
    })
    const store = makeAuthStore("messenger", {
      id: "row-1",
      inboxId: "inbox-1",
    })
    await store.markOffline?.()
    expect(mocks.markUnhealthy).toHaveBeenCalledWith({
      connectionId: "conn-1",
      ownerId: "owner-1",
    })
    expect(mocks.inboxUpdate).not.toHaveBeenCalled()
  })

  it("falls back to a direct Inbox write when no Connection row exists yet", async () => {
    mocks.findByInboxId.mockResolvedValue(undefined)
    const store = makeAuthStore("messenger", {
      id: "row-1",
      inboxId: "inbox-1",
    })
    await store.markOffline?.()
    expect(mocks.markUnhealthy).not.toHaveBeenCalled()
    expect(mocks.inboxUpdateSet).toHaveBeenCalledWith({
      status: "disconnected",
    })
  })

  it("no-ops for a workspace-level integration with no Connection and no inboxId", async () => {
    const store = makeAuthStoreForTableFallback()
    await store.markOffline?.()
    expect(mocks.markUnhealthy).not.toHaveBeenCalled()
    expect(mocks.inboxUpdate).not.toHaveBeenCalled()
  })
})

function makeAuthStoreForTableFallback() {
  mocks.findByInboxId.mockResolvedValue(undefined)
  mocks.findByIntegrationId.mockResolvedValue(undefined)
  return makeAuthStore("claude", { id: "row-1" })
}

describe("makeAuthStore.recordHealth", () => {
  it("transitions verify.ok on a healthy check", async () => {
    mocks.findByInboxId.mockResolvedValue({
      id: "conn-1",
      workspaceId: "ws-1",
    })
    const store = makeAuthStore("messenger", {
      id: "row-1",
      inboxId: "inbox-1",
    })
    await store.recordHealth?.({ ok: true })
    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-1",
      event: "verify.ok",
    })
    expect(mocks.markUnhealthy).not.toHaveBeenCalled()
  })

  it("marks unhealthy with token_revoked when the health check reports a revoked auth", async () => {
    mocks.findByInboxId.mockResolvedValue({
      id: "conn-1",
      workspaceId: "ws-1",
    })
    const store = makeAuthStore("messenger", {
      id: "row-1",
      inboxId: "inbox-1",
    })
    await store.recordHealth?.({ ok: false, revoked: true, error: "expired" })
    expect(mocks.markUnhealthy).toHaveBeenCalledWith({
      connectionId: "conn-1",
      reason: "token_revoked",
      ownerId: "owner-1",
    })
  })

  it("transitions verify.failed_non_auth for a non-auth health failure", async () => {
    mocks.findByInboxId.mockResolvedValue({
      id: "conn-1",
      workspaceId: "ws-1",
    })
    const store = makeAuthStore("messenger", {
      id: "row-1",
      inboxId: "inbox-1",
    })
    await store.recordHealth?.({
      ok: false,
      revoked: false,
      error: "rate_limited",
    })
    expect(mocks.transition).toHaveBeenCalledWith({
      connectionId: "conn-1",
      event: "verify.failed_non_auth",
      reason: "verify_failed",
      ownerId: "owner-1",
    })
  })

  it("no-ops when no Connection row exists yet", async () => {
    mocks.findByInboxId.mockResolvedValue(undefined)
    const store = makeAuthStore("messenger", {
      id: "row-1",
      inboxId: "inbox-1",
    })
    await store.recordHealth?.({ ok: true })
    expect(mocks.transition).not.toHaveBeenCalled()
  })
})
