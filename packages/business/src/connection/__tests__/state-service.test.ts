import { db } from "@chatbotx.io/database/client"
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
  findByProviderSourceId: vi.fn(),
  distinctProvidersByStatus: vi.fn(),
  update: vi.fn(),
  inboxDisconnect: vi.fn(),
  mirrorInbox: vi.fn(async () => undefined),
  lockExisting: vi.fn(),
  cancelLive: vi.fn(),
  tryConsume: vi.fn(),
  release: vi.fn(async () => undefined),
  increment: vi.fn(async () => true),
  decrement: vi.fn(async () => undefined),
  rollbackLiveIncrement: vi.fn(async () => undefined),
  findOwnerUserIdByWorkspaceId: vi.fn(async () => "owner-1"),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: {
    findById: mocks.findById,
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    findByInboxId: mocks.findByInboxId,
    findByIdForUpdateById: mocks.findById,
    findByProviderAndSourceIdAnyWorkspace:
      mocks.findByProviderAndSourceIdAnyWorkspace,
    findByProviderSourceId: mocks.findByProviderSourceId,
    distinctProvidersByStatus: mocks.distinctProvidersByStatus,
    update: mocks.update,
    list: mocks.list,
    count: mocks.count,
  },
  inboxRepository: { updateConnectionMirror: mocks.mirrorInbox },
  aiHandoverSettingsRepository: { lockExisting: mocks.lockExisting },
  aiHandoverBulkRunRepository: { cancelLive: mocks.cancelLive },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
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
    rollbackLiveIncrement: mocks.rollbackLiveIncrement,
  },
}))

vi.mock("../../inbox/service", () => ({
  inboxService: { disconnect: mocks.inboxDisconnect },
}))

vi.mock("../../workspace-member/service", () => ({
  workspaceMemberService: {
    findOwnerUserIdByWorkspaceId: mocks.findOwnerUserIdByWorkspaceId,
  },
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
  mocks.mirrorInbox.mockReset()
  mocks.mirrorInbox.mockResolvedValue(undefined)
  mocks.lockExisting.mockResolvedValue(null)
  mocks.cancelLive.mockReset()
  mocks.tryConsume.mockReset()
  mocks.release.mockClear()
  mocks.increment.mockClear()
  mocks.decrement.mockClear()
  mocks.rollbackLiveIncrement.mockClear()
  mocks.findOwnerUserIdByWorkspaceId.mockReset()
  mocks.findOwnerUserIdByWorkspaceId.mockResolvedValue("owner-1")

  mocks.tryConsume.mockResolvedValue({ ok: true })
  vi.mocked(db.transaction).mockImplementation(
    (async (fn: (tx: unknown) => unknown) =>
      await fn({})) as typeof db.transaction,
  )
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
    expect(mocks.increment).toHaveBeenCalledWith(
      "ws-1",
      "channels",
      1,
      expect.anything(),
    )
    expect(mocks.decrement).not.toHaveBeenCalled()
    expect(mocks.mirrorInbox).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ status: "connected" }),
      }),
      expect.anything(),
    )
  })

  // Regression: `integrationWebchatService.createWithWorkspace` runs this
  // transition inside a transaction that also created the Workspace. The
  // WorkspaceUsage upsert must ride that same `tx`; on any other connection the
  // uncommitted Workspace row is invisible and the FK check fails.
  test("connect.completed on a caller-owned tx writes WorkspaceUsage through that same tx", async () => {
    mocks.findById.mockResolvedValue(baseConnection({ status: "needs_reauth" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "connected" }))
    const callerTx = { marker: "caller-tx" }

    await connectionStateService.transition({
      connectionId: "conn-1",
      event: "connect.completed",
      ownerId: "owner-1",
      tx: callerTx as never,
      quotaConsumption: { consumed: false, workspaceUsageIncremented: false },
    })

    expect(mocks.increment).toHaveBeenCalledWith(
      "ws-1",
      "channels",
      1,
      callerTx,
    )
  })

  test("throws a typed not-found error when the row does not exist", async () => {
    mocks.findById.mockResolvedValue(undefined)

    await expect(
      connectionStateService.transition({
        connectionId: "missing",
        event: "connect.completed",
      }),
    ).rejects.toMatchObject({ code: "notFound", httpStatusCode: 404 })
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
    expect(mocks.mirrorInbox).not.toHaveBeenCalled()
  })

  test("throws when a channel quota edge requires an owner", async () => {
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

  test("writes a release-edge transition without an owner and skips quota release", async () => {
    mocks.findById.mockResolvedValue(baseConnection({ status: "connected" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "needs_reauth" }))

    const result = await connectionStateService.transition({
      connectionId: "conn-1",
      event: "auth.revoked",
    })

    expect(result.status).toBe("needs_reauth")
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ status: "needs_reauth" }),
      }),
      expect.anything(),
    )
    expect(mocks.release).not.toHaveBeenCalled()
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

  test("rolls back quota consumption when the workspace usage increment fails", async () => {
    mocks.findById.mockResolvedValue(baseConnection({ status: "needs_reauth" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "connected" }))
    mocks.increment.mockRejectedValueOnce(new Error("usage write failed"))

    await expect(
      connectionStateService.transition({
        connectionId: "conn-1",
        event: "connect.completed",
        ownerId: "owner-1",
      }),
    ).rejects.toThrow("usage write failed")

    expect(mocks.release).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "channels",
    })
    expect(mocks.decrement).not.toHaveBeenCalled()
  })

  test("defers the channel quota release until after the owned transaction actually commits", async () => {
    mocks.findById.mockResolvedValue(baseConnection({ status: "connected" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "needs_reauth" }))

    const callOrder: string[] = []
    mocks.release.mockImplementationOnce(() => {
      callOrder.push("release")
      return Promise.resolve(undefined)
    })
    vi.mocked(db.transaction).mockImplementationOnce((async (
      fn: (tx: unknown) => unknown,
    ) => {
      const settled = await fn({})
      // The real `db.transaction` only resolves here once Postgres has
      // committed — this marker stands in for that commit point.
      callOrder.push("commit")
      return settled
    }) as typeof db.transaction)

    await connectionStateService.transition({
      connectionId: "conn-1",
      event: "auth.revoked",
      ownerId: "owner-1",
    })

    expect(callOrder).toEqual(["commit", "release"])
  })

  test("stashes the pending release on the caller's handle instead of releasing immediately when a caller-owned tx opts into the handshake", async () => {
    mocks.findById.mockResolvedValue(baseConnection({ status: "connected" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "needs_reauth" }))
    const callerTx = { marker: "caller-tx" }
    const handle: { current: unknown } = { current: "unset" }

    await connectionStateService.transition({
      connectionId: "conn-1",
      event: "auth.revoked",
      ownerId: "owner-1",
      tx: callerTx as never,
      pendingRelease: handle as never,
    })

    expect(mocks.release).not.toHaveBeenCalled()
    expect(handle.current).toEqual({
      ownerId: "owner-1",
      workspaceId: "ws-1",
    })
  })

  test("releases immediately on a caller-owned tx that did not opt into the pendingRelease handshake", async () => {
    mocks.findById.mockResolvedValue(baseConnection({ status: "connected" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "needs_reauth" }))

    await connectionStateService.transition({
      connectionId: "conn-1",
      event: "auth.revoked",
      ownerId: "owner-1",
      tx: { marker: "caller-tx" } as never,
    })

    expect(mocks.release).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "channels",
    })
  })
})

describe("ConnectionStateService rollback of the workspace usage increment", () => {
  // The WorkspaceUsage upsert now rides the transition's own transaction, so a
  // rollback already undoes the durable row. Compensation must therefore undo
  // only the Redis half; a DB decrement would hit the committed row and leave
  // `channelsUsed` one below the live counter until the nightly reconcile.
  test("a commit failure after the usage increment rolls back Redis only, never the DB row", async () => {
    mocks.findById.mockResolvedValue(baseConnection({ status: "needs_reauth" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "connected" }))
    vi.mocked(db.transaction).mockImplementationOnce((async (
      fn: (tx: unknown) => unknown,
    ) => {
      await fn({})
      throw new Error("commit failed")
    }) as typeof db.transaction)

    await expect(
      connectionStateService.transition({
        connectionId: "conn-1",
        event: "connect.completed",
        ownerId: "owner-1",
      }),
    ).rejects.toThrow("commit failed")

    expect(mocks.release).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "channels",
    })
    expect(mocks.rollbackLiveIncrement).toHaveBeenCalledWith("ws-1", "channels")
    expect(mocks.decrement).not.toHaveBeenCalled()
  })

  test("does not touch Redis on rollback when the live usage increment never landed", async () => {
    // Redis was down for the +1 (best-effort, swallowed), the durable row was
    // written on the tx, then COMMIT failed. The row is gone with the
    // transaction and Redis never moved, so a -1 here would under-count.
    mocks.findById.mockResolvedValue(baseConnection({ status: "needs_reauth" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "connected" }))
    mocks.increment.mockResolvedValueOnce(false)
    vi.mocked(db.transaction).mockImplementationOnce((async (
      fn: (tx: unknown) => unknown,
    ) => {
      await fn({})
      throw new Error("commit failed")
    }) as typeof db.transaction)

    await expect(
      connectionStateService.transition({
        connectionId: "conn-1",
        event: "connect.completed",
        ownerId: "owner-1",
      }),
    ).rejects.toThrow("commit failed")

    expect(mocks.release).toHaveBeenCalledTimes(1)
    expect(mocks.rollbackLiveIncrement).not.toHaveBeenCalled()
    expect(mocks.decrement).not.toHaveBeenCalled()
  })

  test("compensateQuotaConsumption rolls back Redis only when the usage increment ran", async () => {
    await connectionStateService.compensateQuotaConsumption({
      ownerId: "owner-1",
      workspaceId: "ws-1",
      workspaceUsageIncremented: true,
    })

    expect(mocks.release).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "channels",
    })
    expect(mocks.rollbackLiveIncrement).toHaveBeenCalledWith("ws-1", "channels")
    expect(mocks.decrement).not.toHaveBeenCalled()
  })

  test("compensateQuotaConsumption leaves workspace usage alone when the increment never ran", async () => {
    await connectionStateService.compensateQuotaConsumption({
      ownerId: "owner-1",
      workspaceId: "ws-1",
      workspaceUsageIncremented: false,
    })

    expect(mocks.release).toHaveBeenCalledTimes(1)
    expect(mocks.rollbackLiveIncrement).not.toHaveBeenCalled()
    expect(mocks.decrement).not.toHaveBeenCalled()
  })
})

describe("ConnectionStateService.releasePendingQuota", () => {
  test("no-ops when nothing was deferred", async () => {
    await expect(
      connectionStateService.releasePendingQuota(null),
    ).resolves.toBeUndefined()

    expect(mocks.release).not.toHaveBeenCalled()
    expect(mocks.decrement).not.toHaveBeenCalled()
  })

  test("releases the channels quota unit the handshake deferred", async () => {
    await connectionStateService.releasePendingQuota({
      ownerId: "owner-1",
      workspaceId: "ws-1",
    })

    expect(mocks.release).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "channels",
    })
    expect(mocks.decrement).toHaveBeenCalledWith("ws-1", "channels")
  })
})

describe("ConnectionStateService.commitReconnect", () => {
  const oauth2Auth = {
    authType: "oauth2" as const,
    clientId: "client-1",
    clientSecret: "secret-1",
    redirectUrl: "https://example.com",
    tokens: {
      accessToken: "token-1",
      expiresAt: "2026-10-10T00:00:00.000Z",
    },
  }

  test("writes auth then reconnects the inbox within the same transaction, computing authExpiresAt from the refreshed auth", async () => {
    mocks.findByInboxId.mockResolvedValue(
      baseConnection({ status: "needs_reauth" }),
    )
    mocks.findById.mockResolvedValue(baseConnection({ status: "needs_reauth" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "connected" }))
    const writeAuth = vi.fn(async () => undefined)

    await connectionStateService.commitReconnect({
      inboxId: "inbox-1",
      workspaceId: "ws-1",
      auth: oauth2Auth,
      writeAuth,
    })

    expect(writeAuth).toHaveBeenCalledWith({})
    expect(mocks.findByInboxId).toHaveBeenCalledWith({ inboxId: "inbox-1" }, {})
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "conn-1",
        values: expect.objectContaining({
          status: "connected",
          authExpiresAt: new Date(oauth2Auth.tokens.expiresAt),
        }),
      }),
      {},
    )
  })

  test("still calls writeAuth even when no Connection row backs this inbox yet (pre-backfill fallback), but never touches the engine", async () => {
    mocks.findByInboxId.mockResolvedValue(undefined)
    const writeAuth = vi.fn(async () => undefined)

    await connectionStateService.commitReconnect({
      inboxId: "inbox-1",
      workspaceId: "ws-1",
      auth: oauth2Auth,
      writeAuth,
    })

    expect(writeAuth).toHaveBeenCalledWith({})
    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("propagates a reconnectInbox failure (e.g. a channel-limit re-check) so the caller's transaction rolls back the auth write too", async () => {
    mocks.findByInboxId.mockResolvedValue(
      baseConnection({ status: "needs_reauth" }),
    )
    mocks.findById.mockResolvedValue(baseConnection({ status: "needs_reauth" }))
    mocks.tryConsume.mockResolvedValue({ ok: false })
    const writeAuth = vi.fn(async () => undefined)

    await expect(
      connectionStateService.commitReconnect({
        inboxId: "inbox-1",
        workspaceId: "ws-1",
        auth: oauth2Auth,
        writeAuth,
      }),
    ).rejects.toMatchObject({ code: "channelLimitReached" })

    expect(writeAuth).toHaveBeenCalledWith({})
  })

  test("regression: compensates the Redis-side quota consumption when a later write in the same caller-owned transaction fails after connect.completed already consumed it", async () => {
    mocks.findByInboxId.mockResolvedValue(
      baseConnection({ status: "needs_reauth" }),
    )
    mocks.findById.mockResolvedValue(baseConnection({ status: "needs_reauth" }))
    const writeFailure = new Error("constraint violation")
    mocks.update.mockRejectedValue(writeFailure)
    const writeAuth = vi.fn(async () => undefined)

    await expect(
      connectionStateService.commitReconnect({
        inboxId: "inbox-1",
        workspaceId: "ws-1",
        auth: oauth2Auth,
        writeAuth,
      }),
    ).rejects.toThrow(writeFailure)

    // `quotaEnforcementService.tryConsume` already succeeded (Redis-side,
    // outside this SQL transaction) before `connectionRepository.update`
    // rejected — without compensation this would leave the workspace
    // permanently short one `channels` slot after the whole reconnect
    // rolls back.
    expect(mocks.tryConsume).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "channels",
    })
    expect(mocks.release).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "channels",
    })
  })
})

describe("ConnectionStateService.commitReconnect — commit failure", () => {
  const oauth2Auth = {
    authType: "oauth2" as const,
    clientId: "client-1",
    clientSecret: "secret-1",
    redirectUrl: "https://example.com",
    tokens: { accessToken: "token-1", expiresAt: "2026-10-10T00:00:00.000Z" },
  }

  // `reconnectInbox` returns successfully (quota consumed, usage incremented
  // on the tx), then the transaction's COMMIT fails. Nothing inside
  // `reconnectInbox` can see that, so `commitReconnect` itself must release
  // the user quota and undo the Redis usage increment (the DB row rolled back
  // with the transaction).
  test("releases the consumed channel quota and rolls back the live usage counter when COMMIT fails after reconnectInbox", async () => {
    mocks.findByInboxId.mockResolvedValue(
      baseConnection({ status: "needs_reauth" }),
    )
    mocks.findById.mockResolvedValue(baseConnection({ status: "needs_reauth" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "connected" }))
    vi.mocked(db.transaction).mockImplementationOnce((async (
      fn: (tx: unknown) => unknown,
    ) => {
      await fn({})
      throw new Error("commit failed")
    }) as typeof db.transaction)

    await expect(
      connectionStateService.commitReconnect({
        inboxId: "inbox-1",
        workspaceId: "ws-1",
        auth: oauth2Auth,
        writeAuth: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("commit failed")

    expect(mocks.tryConsume).toHaveBeenCalledTimes(1)
    expect(mocks.release).toHaveBeenCalledTimes(1)
    expect(mocks.release).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "channels",
    })
    expect(mocks.rollbackLiveIncrement).toHaveBeenCalledWith("ws-1", "channels")
    expect(mocks.decrement).not.toHaveBeenCalled()
  })

  test("keeps the original error when the owner lookup inside the compensation fails", async () => {
    mocks.findByInboxId.mockResolvedValue(
      baseConnection({ status: "needs_reauth" }),
    )
    mocks.findById.mockResolvedValue(baseConnection({ status: "needs_reauth" }))
    mocks.update.mockResolvedValue(baseConnection({ status: "connected" }))
    vi.mocked(db.transaction).mockImplementationOnce((async (
      fn: (tx: unknown) => unknown,
    ) => {
      await fn({})
      throw new Error("commit failed")
    }) as typeof db.transaction)
    // First call feeds `reconnectInbox`; the second, inside the catch, fails.
    mocks.findOwnerUserIdByWorkspaceId
      .mockResolvedValueOnce("owner-1")
      .mockRejectedValueOnce(new Error("owner lookup failed"))

    await expect(
      connectionStateService.commitReconnect({
        inboxId: "inbox-1",
        workspaceId: "ws-1",
        auth: oauth2Auth,
        writeAuth: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("commit failed")

    expect(mocks.release).not.toHaveBeenCalled()
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
    expect(mocks.mirrorInbox).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          status: "disconnected",
          disconnectReason: "token_revoked",
        }),
      }),
      expect.anything(),
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

  test("does not overwrite an active connection's status reason for a no-op connect, but still re-asserts the Inbox mirror", async () => {
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
    expect(mocks.mirrorInbox).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          status: "connected",
          disconnectedAt: null,
          disconnectReason: null,
        }),
      }),
      expect.anything(),
    )
  })

  test("persists a new reason for a same-status transition", async () => {
    mocks.findById.mockResolvedValue(
      baseConnection({ status: "degraded", statusReason: "refresh_failed" }),
    )
    mocks.update.mockResolvedValue(
      baseConnection({ status: "degraded", statusReason: "verify_failed" }),
    )

    const result = await connectionStateService.transition({
      connectionId: "conn-1",
      event: "verify.failed_non_auth",
      reason: "verify_failed",
      ownerId: "owner-1",
    })

    expect(result.statusReason).toBe("verify_failed")
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        values: { statusReason: "verify_failed" },
      }),
      expect.anything(),
    )
  })

  test("is an idempotent no-op that still re-asserts the Inbox mirror when the connection is already inactive", async () => {
    mocks.findById.mockResolvedValue(baseConnection({ status: "needs_reauth" }))

    await connectionStateService.markUnhealthy({
      connectionId: "conn-1",
      ownerId: "owner-1",
    })

    expect(mocks.update).not.toHaveBeenCalled()
    // A no-op re-assertion must NOT stamp a fresh `disconnectReason`/
    // `disconnectedAt` over whatever is already stored on the Inbox row —
    // `values` carries only `status` here, nothing else.
    expect(mocks.mirrorInbox).toHaveBeenCalledWith(
      {
        inboxId: "inbox-1",
        workspaceId: "ws-1",
        values: { status: "disconnected" },
      },
      expect.anything(),
    )
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

  test("resolves via the workspace-scoped unique key when workspaceId is given, never touching the any-workspace fallback", async () => {
    mocks.findByProviderSourceId.mockResolvedValue(
      baseConnection({ id: "conn-3", status: "connected" }),
    )
    mocks.findById.mockResolvedValue(
      baseConnection({ id: "conn-3", status: "connected" }),
    )
    mocks.update.mockResolvedValue(
      baseConnection({ id: "conn-3", status: "needs_reauth" }),
    )

    const result = await connectionStateService.markUnhealthyByIdentifier({
      provider: "tiktok",
      identifier: "open-id-2",
      ownerId: "owner-1",
      workspaceId: "ws-1",
    })

    expect(mocks.findByProviderSourceId).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      provider: "tiktok",
      sourceId: "open-id-2",
    })
    expect(mocks.findByProviderAndSourceIdAnyWorkspace).not.toHaveBeenCalled()
    expect(result?.status).toBe("needs_reauth")
  })

  test("returns null without falling back to the any-workspace lookup when the workspace-scoped key has no match", async () => {
    mocks.findByProviderSourceId.mockResolvedValue(undefined)

    const result = await connectionStateService.markUnhealthyByIdentifier({
      provider: "tiktok",
      identifier: "open-id-3",
      workspaceId: "ws-other",
    })

    expect(result).toBeNull()
    expect(mocks.findByProviderAndSourceIdAnyWorkspace).not.toHaveBeenCalled()
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
