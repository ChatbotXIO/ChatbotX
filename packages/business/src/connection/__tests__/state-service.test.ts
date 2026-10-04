import { beforeEach, describe, expect, test, vi } from "vitest"
import { connectionStateService } from "../state-service"

const NO_OWNER_ID_MESSAGE = /no ownerId/

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  list: vi.fn(),
  count: vi.fn(),
  findByInboxId: vi.fn(),
  findByProviderAndSourceIdAnyWorkspace: vi.fn(),
  update: vi.fn(),
  inboxDisconnect: vi.fn(),
  inboxUpdate: vi.fn(),
  inboxUpdateSet: vi.fn(),
  inboxUpdateWhere: vi.fn(),
  lockExisting: vi.fn(),
  cancelLive: vi.fn(),
  tryConsume: vi.fn(),
  release: vi.fn(async () => undefined),
  increment: vi.fn(async () => undefined),
  decrement: vi.fn(async () => undefined),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: {
    findById: mocks.findById,
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    findByInboxId: mocks.findByInboxId,
    findByIdForUpdate: mocks.findById,
    findByIdForUpdateById: mocks.findById,
    findByProviderAndSourceIdAnyWorkspace:
      mocks.findByProviderAndSourceIdAnyWorkspace,
    update: mocks.update,
    list: mocks.list,
    count: mocks.count,
  },
  aiHandoverSettingsRepository: { lockExisting: mocks.lockExisting },
  aiHandoverBulkRunRepository: { cancelLive: mocks.cancelLive },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    update: mocks.inboxUpdate,
    transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ update: mocks.inboxUpdate }),
    ),
  },
  and: vi.fn((...conditions) => conditions),
  eq: vi.fn((column, value) => ({ column, value })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  inboxModel: { id: "id", workspaceId: "workspaceId" },
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

vi.mock("../../inbox/service", () => ({
  inboxService: { disconnect: mocks.inboxDisconnect },
}))

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
  mocks.findByIdForWorkspace.mockReset()
  mocks.list.mockReset()
  mocks.count.mockReset()
  mocks.findByInboxId.mockReset()
  mocks.inboxDisconnect.mockReset()
  mocks.findByProviderAndSourceIdAnyWorkspace.mockReset()
  mocks.update.mockReset()
  mocks.inboxUpdate.mockReset()
  mocks.inboxUpdateSet.mockReset()
  mocks.inboxUpdateWhere.mockReset()
  mocks.lockExisting.mockResolvedValue(null)
  mocks.cancelLive.mockReset()
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

  test("releases a consumed quota reservation when the state write fails", async () => {
    mocks.findById.mockResolvedValue(baseConnection({ status: "needs_reauth" }))
    mocks.update.mockRejectedValueOnce(new Error("database write failed"))

    await expect(
      connectionStateService.transition({
        connectionId: "conn-1",
        event: "connect.completed",
        ownerId: "owner-1",
      }),
    ).rejects.toThrow("database write failed")

    expect(mocks.release).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "channels",
    })
    expect(mocks.decrement).not.toHaveBeenCalled()
  })
})

describe("ConnectionStateService.disconnectInbox", () => {
  test("transitions a matching Connection through user.disconnect", async () => {
    mocks.findByInboxId.mockResolvedValue(
      baseConnection({ status: "connected" }),
    )
    mocks.findById.mockResolvedValue(baseConnection({ status: "connected" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "disconnected" }))

    await connectionStateService.disconnectInbox({
      inboxId: "inbox-1",
      workspaceId: "ws-1",
      ownerId: "owner-1",
    })

    expect(mocks.inboxDisconnect).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "conn-1",
        workspaceId: "ws-1",
        values: expect.objectContaining({ status: "disconnected" }),
      }),
      expect.anything(),
    )
  })

  test("uses the inbox-only legacy path before Connection backfill", async () => {
    mocks.findByInboxId.mockResolvedValue(undefined)

    await connectionStateService.disconnectInbox({
      inboxId: "inbox-1",
      workspaceId: "ws-1",
      ownerId: "owner-1",
    })

    expect(mocks.inboxDisconnect).toHaveBeenCalledWith({
      inboxId: "inbox-1",
      workspaceId: "ws-1",
      ownerId: "owner-1",
      reason: "manual",
    })
  })

  test("rejects a Connection from another workspace", async () => {
    mocks.findByInboxId.mockResolvedValue(
      baseConnection({ workspaceId: "other-workspace" }),
    )

    await expect(
      connectionStateService.disconnectInbox({
        inboxId: "inbox-1",
        workspaceId: "ws-1",
        ownerId: "owner-1",
      }),
    ).rejects.toThrow("inbox-1")

    expect(mocks.inboxDisconnect).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
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

  test("cancels live AI handover bulk runs in the same transaction as an inactive mirror", async () => {
    mocks.findById.mockResolvedValue(baseConnection({ status: "connected" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "needs_reauth" }))
    mocks.lockExisting.mockResolvedValue({ id: "settings-1" })

    await connectionStateService.markUnhealthy({
      connectionId: "conn-1",
      ownerId: "owner-1",
    })

    expect(mocks.cancelLive).toHaveBeenCalledWith(
      { workspaceId: "ws-1", inboxId: "inbox-1" },
      expect.anything(),
    )
  })

  test("does not overwrite an active connection's status reason or mirror Inbox for a no-op connect", async () => {
    const active = baseConnection({
      status: "connected",
      statusReason: "verify_failed",
    })
    mocks.findById.mockResolvedValue(active)

    const result = await connectionStateService.transition({
      connectionId: "conn-1",
      event: "connect.completed",
      ownerId: "owner-1",
    })

    expect(result).toBe(active)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.inboxUpdateSet).not.toHaveBeenCalled()
  })

  test("is an idempotent no-op without overwriting the row or mirroring Inbox when the connection is already inactive", async () => {
    mocks.findById.mockResolvedValue(baseConnection({ status: "needs_reauth" }))

    await connectionStateService.markUnhealthy({
      connectionId: "conn-1",
      ownerId: "owner-1",
    })

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.inboxUpdateSet).not.toHaveBeenCalled()
    expect(mocks.release).not.toHaveBeenCalled()
    expect(mocks.tryConsume).not.toHaveBeenCalled()
  })

  test("does not throw (and does not roll back the status write) when quotaEnforcementService.release fails (regression: a Redis/DB release error previously propagated and could roll back a disconnect already acted on remotely)", async () => {
    mocks.findById.mockResolvedValue(baseConnection({ status: "connected" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "needs_reauth" }))
    mocks.release.mockRejectedValueOnce(new Error("redis down"))

    const result = await connectionStateService.markUnhealthy({
      connectionId: "conn-1",
      ownerId: "owner-1",
    })

    expect(result.status).toBe("needs_reauth")
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
  test("updates auth metadata inside the locked transition and restores degraded to connected with no quota change", async () => {
    const expiresAt = new Date("2026-01-01T00:00:00Z")
    mocks.findById.mockResolvedValue(baseConnection({ status: "degraded" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "connected" }))

    const result = await connectionStateService.recordAuthSaved({
      connectionId: "conn-1",
      authExpiresAt: expiresAt,
    })

    expect(result.status).toBe("connected")
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "conn-1",
        workspaceId: "ws-1",
        values: expect.objectContaining({
          authExpiresAt: expiresAt,
          lastError: null,
          status: "connected",
        }),
      }),
      expect.anything(),
    )
    expect(mocks.tryConsume).not.toHaveBeenCalled()
    expect(mocks.release).not.toHaveBeenCalled()
  })
})

describe("ConnectionStateService workspace-scoped reads and display name", () => {
  test("lists data and count with the same workspace scope", async () => {
    const input = { workspaceId: "ws-1", page: 1, limit: 20 }
    const data = [baseConnection()]
    mocks.list.mockResolvedValue(data)
    mocks.count.mockResolvedValue(1)

    await expect(connectionStateService.list(input)).resolves.toEqual({
      data,
      count: 1,
    })
    expect(mocks.list).toHaveBeenCalledWith(input)
    expect(mocks.count).toHaveBeenCalledWith(input)
  })

  test("gets a connection only through its workspace-scoped repository lookup", async () => {
    const connection = baseConnection()
    mocks.findByIdForWorkspace.mockResolvedValue(connection)

    await expect(
      connectionStateService.getForWorkspace({
        id: "conn-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toEqual(connection)
    expect(mocks.findByIdForWorkspace).toHaveBeenCalledWith({
      id: "conn-1",
      workspaceId: "ws-1",
    })
  })

  test("updates only the display name and does nothing when the connection is absent", async () => {
    mocks.findByIdForWorkspace.mockResolvedValueOnce(undefined)
    await expect(
      connectionStateService.updateDisplayName({
        id: "missing",
        workspaceId: "ws-1",
        displayName: "Ignored",
      }),
    ).resolves.toBeUndefined()
    expect(mocks.update).not.toHaveBeenCalled()

    const existing = baseConnection()
    const updated = baseConnection({ displayName: "Renamed" })
    mocks.findByIdForWorkspace.mockResolvedValueOnce(existing)
    mocks.update.mockResolvedValueOnce(updated)

    await expect(
      connectionStateService.updateDisplayName({
        id: "conn-1",
        workspaceId: "ws-1",
        displayName: "Renamed",
      }),
    ).resolves.toEqual(updated)
    expect(mocks.update).toHaveBeenCalledWith({
      id: "conn-1",
      workspaceId: "ws-1",
      values: { displayName: "Renamed" },
    })
  })
})
