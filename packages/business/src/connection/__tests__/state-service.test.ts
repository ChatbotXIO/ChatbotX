import { beforeEach, describe, expect, test, vi } from "vitest"

const NO_OWNER_ID_MESSAGE = /no ownerId/

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findByProviderAndSourceIdAnyWorkspace: vi.fn(),
  update: vi.fn(),
  inboxUpdate: vi.fn(),
  inboxUpdateSet: vi.fn(),
  inboxUpdateWhere: vi.fn(),
  tryConsume: vi.fn(),
  release: vi.fn(async () => undefined),
  increment: vi.fn(async () => undefined),
  decrement: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: {
    findById: mocks.findById,
    findByProviderAndSourceIdAnyWorkspace:
      mocks.findByProviderAndSourceIdAnyWorkspace,
    update: mocks.update,
    list: vi.fn(),
    count: vi.fn(),
    listDueForRefresh: vi.fn(),
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: mocks.inboxUpdate,
    transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ update: mocks.inboxUpdate }),
    ),
  },
  eq: vi.fn((column, value) => ({ column, value })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  inboxModel: { id: "id" },
  workspaceUsageModel: {},
}))

vi.mock("../../quota-enforcement/service", () => ({
  quotaEnforcementService: {
    tryConsume: mocks.tryConsume,
    release: mocks.release,
  },
}))

vi.mock("../../workspace-usage/service", () => ({
  workspaceUsageService: {
    increment: mocks.increment,
    decrement: mocks.decrement,
  },
}))

const { connectionStateService } = await import("../state-service")

const baseConnection = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "conn-1",
  workspaceId: "ws-1",
  provider: "messenger",
  kind: "channel",
  channel: "messenger",
  inboxId: "inbox-1",
  integrationId: null,
  sourceId: "page-1",
  displayName: "My Page",
  status: "needs_reauth",
  statusReason: "token_revoked",
  lastError: null,
  authExpiresAt: null,
  createdBy: null,
  connectedAt: null,
  disconnectedAt: new Date(),
  ...overrides,
})

beforeEach(() => {
  mocks.findById.mockReset()
  mocks.findByProviderAndSourceIdAnyWorkspace.mockReset()
  mocks.update.mockReset()
  mocks.inboxUpdate.mockReset()
  mocks.inboxUpdateSet.mockReset()
  mocks.inboxUpdateWhere.mockReset()
  mocks.tryConsume.mockReset()
  mocks.release.mockClear()
  mocks.increment.mockClear()
  mocks.decrement.mockClear()

  mocks.inboxUpdateSet.mockImplementation(() => ({
    where: mocks.inboxUpdateWhere,
  }))
  mocks.inboxUpdate.mockImplementation(() => ({ set: mocks.inboxUpdateSet }))
  mocks.inboxUpdateWhere.mockResolvedValue(undefined)
  mocks.tryConsume.mockResolvedValue({ ok: true })
})

describe("ConnectionStateService.transition", () => {
  test("connect.completed from needs_reauth consumes quota once and mirrors Inbox to connected", async () => {
    mocks.findById.mockResolvedValue(baseConnection({ status: "needs_reauth" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "connected" }))

    const result = await connectionStateService.transition({
      connectionId: "conn-1",
      event: "connect.completed",
      ownerId: "owner-1",
    })

    expect(result.status).toBe("connected")
    expect(mocks.tryConsume).toHaveBeenCalledTimes(1)
    expect(mocks.tryConsume).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "channels",
    })
    expect(mocks.release).not.toHaveBeenCalled()
    expect(mocks.increment).toHaveBeenCalledWith("ws-1", "channels")
    expect(mocks.decrement).not.toHaveBeenCalled()
    expect(mocks.inboxUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "connected" }),
    )
  })

  test("throws ConnectionNotFoundException-style error when the row does not exist", async () => {
    mocks.findById.mockResolvedValue(undefined)

    await expect(
      connectionStateService.transition({
        connectionId: "missing",
        event: "connect.completed",
      }),
    ).rejects.toThrow("missing")
  })

  test("never consumes quota for a kind:integration connection even when ownerId is passed", async () => {
    mocks.findById.mockResolvedValue(
      baseConnection({
        kind: "integration",
        channel: null,
        inboxId: null,
        integrationId: "int-1",
        status: "disconnected",
      }),
    )
    mocks.update.mockResolvedValue(
      baseConnection({ kind: "integration", status: "connected" }),
    )

    const result = await connectionStateService.transition({
      connectionId: "conn-1",
      event: "connect.completed",
      ownerId: "owner-1",
    })

    expect(result.status).toBe("connected")
    expect(mocks.tryConsume).not.toHaveBeenCalled()
    expect(mocks.release).not.toHaveBeenCalled()
  })

  test("throws channelLimitReached and never writes status when quota consume fails (I5)", async () => {
    mocks.findById.mockResolvedValue(baseConnection({ status: "needs_reauth" }))
    mocks.tryConsume.mockResolvedValueOnce({ ok: false })

    await expect(
      connectionStateService.transition({
        connectionId: "conn-1",
        event: "connect.completed",
        ownerId: "owner-1",
      }),
    ).rejects.toMatchObject({ code: "channelLimitReached" })

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.inboxUpdateSet).not.toHaveBeenCalled()
  })

  test("throws when a channel quotaEdge is required but no ownerId is supplied (I8)", async () => {
    mocks.findById.mockResolvedValue(baseConnection({ status: "needs_reauth" }))

    await expect(
      connectionStateService.transition({
        connectionId: "conn-1",
        event: "connect.completed",
      }),
    ).rejects.toThrow(NO_OWNER_ID_MESSAGE)

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.tryConsume).not.toHaveBeenCalled()
  })
})

describe("ConnectionStateService.markUnhealthy", () => {
  test("releases quota exactly once from an ACTIVE connection and mirrors Inbox to disconnected(token_revoked)", async () => {
    mocks.findById.mockResolvedValue(baseConnection({ status: "connected" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "needs_reauth" }))

    const result = await connectionStateService.markUnhealthy({
      connectionId: "conn-1",
      ownerId: "owner-1",
    })

    expect(result.status).toBe("needs_reauth")
    expect(mocks.release).toHaveBeenCalledTimes(1)
    expect(mocks.release).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "channels",
    })
    expect(mocks.decrement).toHaveBeenCalledWith("ws-1", "channels")
    expect(mocks.increment).not.toHaveBeenCalled()
    expect(mocks.tryConsume).not.toHaveBeenCalled()
    expect(mocks.inboxUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "disconnected",
        disconnectReason: "token_revoked",
      }),
    )
  })

  test("is an idempotent no-op (no quota release) when the connection is already INACTIVE", async () => {
    mocks.findById.mockResolvedValue(baseConnection({ status: "needs_reauth" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "needs_reauth" }))

    await connectionStateService.markUnhealthy({
      connectionId: "conn-1",
      ownerId: "owner-1",
    })

    expect(mocks.release).not.toHaveBeenCalled()
    expect(mocks.tryConsume).not.toHaveBeenCalled()
  })
})

describe("ConnectionStateService.markUnhealthyByIdentifier", () => {
  test("returns null and never touches quota when no connection matches the identifier", async () => {
    mocks.findByProviderAndSourceIdAnyWorkspace.mockResolvedValue(undefined)

    const result = await connectionStateService.markUnhealthyByIdentifier({
      provider: "tiktok",
      identifier: "open-id-1",
    })

    expect(result).toBeNull()
    expect(mocks.findById).not.toHaveBeenCalled()
    expect(mocks.release).not.toHaveBeenCalled()
  })

  test("delegates to markUnhealthy when a connection matches", async () => {
    mocks.findByProviderAndSourceIdAnyWorkspace.mockResolvedValue(
      baseConnection({ id: "conn-2", status: "connected" }),
    )
    mocks.findById.mockResolvedValue(
      baseConnection({ id: "conn-2", status: "connected" }),
    )
    mocks.update.mockResolvedValue(
      baseConnection({ id: "conn-2", status: "needs_reauth" }),
    )

    const result = await connectionStateService.markUnhealthyByIdentifier({
      provider: "tiktok",
      identifier: "open-id-1",
      ownerId: "owner-1",
    })

    expect(result?.status).toBe("needs_reauth")
    expect(mocks.release).toHaveBeenCalledTimes(1)
  })
})

describe("ConnectionStateService.recordAuthSaved", () => {
  test("clears lastError, sets authExpiresAt, and transitions degraded back to connected with no quota change", async () => {
    mocks.update.mockResolvedValueOnce(undefined)
    mocks.findById.mockResolvedValue(baseConnection({ status: "degraded" }))
    mocks.update.mockResolvedValueOnce(baseConnection({ status: "connected" }))

    const expiresAt = new Date("2026-01-01T00:00:00Z")
    const result = await connectionStateService.recordAuthSaved({
      connectionId: "conn-1",
      authExpiresAt: expiresAt,
    })

    expect(result.status).toBe("connected")
    expect(mocks.update.mock.calls[0][0]).toEqual({
      id: "conn-1",
      values: { authExpiresAt: expiresAt, lastError: null },
    })
    expect(mocks.tryConsume).not.toHaveBeenCalled()
    expect(mocks.release).not.toHaveBeenCalled()
  })
})
