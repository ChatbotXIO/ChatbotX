import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  countActiveByWorkspaceId: vi.fn(async () => 0),
  insert: vi.fn(),
  update: vi.fn(),
  findById: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  findByStateNonceHash: vi.fn(),
  claimTarget: vi.fn(),
  releaseTarget: vi.fn(),
  appendResults: vi.fn(),
  completeReconnect: vi.fn(),
  updateWhereStatusIn: vi.fn(),
  expireDue: vi.fn(async () => 0),
  purgeOldTerminal: vi.fn(
    async (): Promise<{
      deleted: number
      stopReason: "drained" | "deadline" | "chunkCap"
    }> => ({
      deleted: 0,
      stopReason: "drained",
    }),
  ),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectSessionRepository: {
    countActiveByWorkspaceId: mocks.countActiveByWorkspaceId,
    insert: mocks.insert,
    update: mocks.update,
    findById: mocks.findById,
    findByIdForWorkspace: mocks.findByIdForWorkspace,
    findByStateNonceHash: mocks.findByStateNonceHash,
    claimTarget: mocks.claimTarget,
    releaseTarget: mocks.releaseTarget,
    appendResults: mocks.appendResults,
    completeReconnect: mocks.completeReconnect,
    updateWhereStatusIn: mocks.updateWhereStatusIn,
    expireDue: mocks.expireDue,
    purgeOldTerminal: mocks.purgeOldTerminal,
  },
}))

const { connectSessionService } = await import("../service")

const FUTURE = new Date(Date.now() + 60_000)
const PAST = new Date(Date.now() - 60_000)

const baseSession = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "session-1",
  workspaceId: "ws-1",
  provider: "messenger",
  status: "pending",
  expiresAt: FUTURE,
  targets: [],
  results: [],
  resultConnectionIds: [],
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.countActiveByWorkspaceId.mockResolvedValue(0)
  mocks.update.mockImplementation(
    async (input: { id: string; values: Record<string, unknown> }) => ({
      ...baseSession(),
      id: input.id,
      ...input.values,
    }),
  )
  mocks.updateWhereStatusIn.mockImplementation(
    async (input: { id: string; values: Record<string, unknown> }) => ({
      ...baseSession(),
      id: input.id,
      ...input.values,
    }),
  )
  mocks.findById.mockResolvedValue(baseSession())
  mocks.completeReconnect.mockImplementation(
    async (input: { id: string; result: Record<string, unknown> }) =>
      baseSession({
        id: input.id,
        status: "completed",
        results: [input.result],
      }),
  )
})

describe("connectSessionService.create", () => {
  it("throws when neither actorUserId nor actorTokenId is provided", async () => {
    await expect(
      connectSessionService.create({
        workspaceId: "ws-1",
        provider: "messenger",
        purpose: "connect",
      }),
    ).rejects.toThrow("exactly one of actorUserId/actorTokenId")
  })

  it("throws when both actorUserId and actorTokenId are provided", async () => {
    await expect(
      connectSessionService.create({
        workspaceId: "ws-1",
        provider: "messenger",
        purpose: "connect",
        actorUserId: "user-1",
        actorTokenId: "token-1",
      }),
    ).rejects.toThrow("exactly one of actorUserId/actorTokenId")
  })

  it("throws connectSessionLimitReached at the per-workspace pending cap", async () => {
    mocks.countActiveByWorkspaceId.mockResolvedValue(20)
    await expect(
      connectSessionService.create({
        workspaceId: "ws-1",
        provider: "messenger",
        purpose: "connect",
        actorUserId: "user-1",
      }),
    ).rejects.toMatchObject({ code: "connectSessionLimitReached" })
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it("mints a nonce whose hash resolves back to the inserted session via findByNonce", async () => {
    mocks.insert.mockImplementation(
      async (values: Record<string, unknown>) => ({
        ...baseSession(),
        ...values,
      }),
    )

    const { session, nonce } = await connectSessionService.create({
      workspaceId: "ws-1",
      provider: "messenger",
      purpose: "connect",
      actorUserId: "user-1",
    })

    expect(session.status).toBe("pending")
    expect(typeof nonce).toBe("string")
    expect(nonce).toHaveLength(64) // 32 bytes hex-encoded

    const insertedHash = mocks.insert.mock.calls[0][0].stateNonceHash
    mocks.findByStateNonceHash.mockImplementation(
      async (input: { stateNonceHash: string }) =>
        input.stateNonceHash === insertedHash ? session : undefined,
    )

    await expect(connectSessionService.findByNonce(nonce)).resolves.toEqual(
      session,
    )
    await expect(
      connectSessionService.findByNonce("wrong-nonce"),
    ).resolves.toBeUndefined()
  })
})

describe("expiry rule", () => {
  it("lazily flips an active session past expiresAt to expired, guarded and clearing consumedAt/encryptedAuth", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      baseSession({ expiresAt: PAST, status: "pending" }),
    )

    const result = await connectSessionService.findByIdForWorkspace({
      id: "session-1",
      workspaceId: "ws-1",
    })

    expect(result?.status).toBe("expired")
    expect(mocks.updateWhereStatusIn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "session-1",
        statuses: expect.arrayContaining([
          "pending",
          "authorized",
          "awaiting_selection",
        ]),
        values: expect.objectContaining({
          status: "expired",
          consumedAt: expect.any(Date),
          encryptedAuth: null,
        }),
      }),
    )
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("does not flip a session a concurrent completion already made terminal (regression: lazy expiry must not overwrite a concurrent completion)", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      baseSession({ expiresAt: PAST, status: "pending" }),
    )
    mocks.updateWhereStatusIn.mockResolvedValue(undefined)
    mocks.findById.mockResolvedValue(baseSession({ status: "completed" }))

    const result = await connectSessionService.findByIdForWorkspace({
      id: "session-1",
      workspaceId: "ws-1",
    })

    expect(result?.status).toBe("completed")
  })

  it("does not touch a terminal-status session past expiresAt", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      baseSession({ expiresAt: PAST, status: "completed" }),
    )

    const result = await connectSessionService.findByIdForWorkspace({
      id: "session-1",
      workspaceId: "ws-1",
    })

    expect(result?.status).toBe("completed")
    expect(mocks.updateWhereStatusIn).not.toHaveBeenCalled()
  })

  it("returns an unexpired session unchanged", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseSession())

    const result = await connectSessionService.findByIdForWorkspace({
      id: "session-1",
      workspaceId: "ws-1",
    })

    expect(result?.status).toBe("pending")
    expect(mocks.updateWhereStatusIn).not.toHaveBeenCalled()
  })
})

describe("connectSessionService.attachAuthorization", () => {
  it("throws connectSessionExpired when the session is not active", async () => {
    mocks.updateWhereStatusIn.mockResolvedValueOnce(undefined)
    mocks.findById.mockResolvedValue(baseSession({ status: "completed" }))

    await expect(
      connectSessionService.attachAuthorization({
        id: "session-1",
        encryptedAuth: { iv: "x", ciphertext: "y", keyId: "k" } as never,
        targets: [],
      }),
    ).rejects.toMatchObject({ code: "connectSessionExpired" })
  })

  it("moves an active session to awaiting_selection with the given targets", async () => {
    const targets = [{ id: "page-1", name: "Page One", selectable: true }]
    await connectSessionService.attachAuthorization({
      id: "session-1",
      encryptedAuth: { iv: "x", ciphertext: "y", keyId: "k" } as never,
      targets,
    })

    expect(mocks.updateWhereStatusIn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "session-1",
        statuses: expect.arrayContaining([
          "pending",
          "authorized",
          "awaiting_selection",
        ]),
        values: expect.objectContaining({
          status: "awaiting_selection",
          step: "select",
          targets,
        }),
      }),
    )
  })

  it("throws notFound when the session does not exist", async () => {
    mocks.findById.mockResolvedValue(undefined)

    await expect(
      connectSessionService.attachAuthorization({
        id: "missing",
        encryptedAuth: { iv: "x", ciphertext: "y", keyId: "k" } as never,
        targets: [],
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})

describe("connectSessionService.claimAuthorization", () => {
  it("claims an OAuth callback with a pending-only compare-and-set", async () => {
    await expect(
      connectSessionService.claimAuthorization({
        id: "session-1",
        workspaceId: "ws-1",
      }),
    ).resolves.toMatchObject({ status: "authorized" })

    expect(mocks.updateWhereStatusIn).toHaveBeenCalledWith({
      id: "session-1",
      workspaceId: "ws-1",
      statuses: ["pending"],
      requireUnexpired: true,
      values: { status: "authorized" },
    })
  })
})

describe("connectSessionService.claimTarget", () => {
  it("scopes atomic claims to the session workspace", async () => {
    mocks.claimTarget.mockResolvedValue(true)
    await expect(
      connectSessionService.claimTarget({
        id: "session-1",
        targetId: "page-1",
      }),
    ).resolves.toBe(true)
    expect(mocks.claimTarget).toHaveBeenCalledWith({
      id: "session-1",
      targetId: "page-1",
      workspaceId: "ws-1",
    })
  })

  it("returns false when the target was already claimed (race lost)", async () => {
    mocks.claimTarget.mockResolvedValue(false)
    await expect(
      connectSessionService.claimTarget({
        id: "session-1",
        targetId: "page-1",
      }),
    ).resolves.toBe(false)
  })
})

describe("connectSessionService.recordResults", () => {
  it("scopes atomic result merges to the session workspace", async () => {
    mocks.appendResults.mockResolvedValue(
      baseSession({ status: "awaiting_selection" }),
    )
    const result = await connectSessionService.recordResults({
      id: "session-1",
      results: [{ targetId: "a", status: "connected", connectionId: "c1" }],
      resultConnectionIds: ["c1"],
    })
    expect(mocks.appendResults).toHaveBeenCalledWith({
      id: "session-1",
      results: [{ targetId: "a", status: "connected", connectionId: "c1" }],
      resultConnectionIds: ["c1"],
      workspaceId: "ws-1",
    })
    expect(result.status).toBe("awaiting_selection")
  })

  it("returns the session's current terminal row instead of throwing when the atomic update's status guard no-ops (regression: a concurrent/replayed batch on an already-terminal session)", async () => {
    mocks.appendResults.mockResolvedValue(undefined)
    mocks.findById.mockResolvedValue(baseSession({ status: "completed" }))

    const result = await connectSessionService.recordResults({
      id: "session-1",
      results: [{ targetId: "a", status: "connected", connectionId: "c1" }],
      resultConnectionIds: ["c1"],
    })

    expect(result.status).toBe("completed")
  })

  it("throws when the session truly does not exist", async () => {
    mocks.appendResults.mockResolvedValue(undefined)
    mocks.findById.mockResolvedValue(undefined)

    await expect(
      connectSessionService.recordResults({
        id: "session-missing",
        results: [],
        resultConnectionIds: [],
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})

describe("connectSessionService.completeReconnect", () => {
  it("completes a pending reconnect session with its connected result", async () => {
    const result = await connectSessionService.completeReconnect({
      id: "session-1",
      workspaceId: "ws-1",
      result: {
        targetId: "page-1",
        status: "connected",
        connectionId: "conn-1",
      },
    })

    expect(mocks.completeReconnect).toHaveBeenCalledWith({
      id: "session-1",
      workspaceId: "ws-1",
      result: {
        targetId: "page-1",
        status: "connected",
        connectionId: "conn-1",
      },
    })
    expect(result.status).toBe("completed")
  })
})

describe("connectSessionService.releaseTarget", () => {
  it("scopes claim releases to the session workspace", async () => {
    await connectSessionService.releaseTarget({
      id: "session-1",
      targetId: "page-1",
    })
    expect(mocks.releaseTarget).toHaveBeenCalledWith({
      id: "session-1",
      targetId: "page-1",
      workspaceId: "ws-1",
    })
  })
})

describe("connectSessionService.fail / cancel", () => {
  it("fail sets status failed with the given errorCode, guarded to active sessions only", async () => {
    const result = await connectSessionService.fail({
      id: "session-1",
      errorCode: "provider_denied",
    })
    expect(result.status).toBe("failed")
    expect(result.errorCode).toBe("provider_denied")
    expect(mocks.updateWhereStatusIn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "session-1",
        statuses: expect.arrayContaining([
          "pending",
          "authorized",
          "awaiting_selection",
        ]),
      }),
    )
  })

  it("fail does not flip an already-terminal session (regression: a replayed OAuth callback `?error=` must not override a completed session)", async () => {
    mocks.updateWhereStatusIn.mockResolvedValue(undefined)
    mocks.findById.mockResolvedValue(baseSession({ status: "completed" }))

    const result = await connectSessionService.fail({
      id: "session-1",
      errorCode: "provider_denied",
    })

    expect(result.status).toBe("completed")
  })

  it("cancel requires the session to belong to the workspace", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(undefined)
    await expect(
      connectSessionService.cancel({ id: "session-1", workspaceId: "ws-1" }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  it("cancel sets status cancelled for an owned session", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseSession())
    const result = await connectSessionService.cancel({
      id: "session-1",
      workspaceId: "ws-1",
    })
    expect(result.status).toBe("cancelled")
  })

  it("cancel does not flip an already-terminal session", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      baseSession({ status: "failed", errorCode: "provider_denied" }),
    )
    mocks.updateWhereStatusIn.mockResolvedValue(undefined)

    const result = await connectSessionService.cancel({
      id: "session-1",
      workspaceId: "ws-1",
    })

    expect(result.status).toBe("failed")
  })
})

describe("connectSessionService.purgeExpired", () => {
  it("delegates the bulk expire to connectSessionRepository.expireDue and reports its count", async () => {
    mocks.expireDue.mockResolvedValue(2)

    const result = await connectSessionService.purgeExpired({
      retentionDays: 7,
      chunkSize: 500,
      interChunkDelayMs: 100,
      maxChunks: 1000,
    })

    expect(mocks.expireDue).toHaveBeenCalledWith(
      expect.objectContaining({
        statuses: expect.arrayContaining([
          "pending",
          "authorized",
          "awaiting_selection",
        ]),
      }),
    )
    expect(result.expired).toBe(2)
  })

  it("delegates the terminal-row retention delete to connectSessionRepository.purgeOldTerminal and reports its count/stopReason", async () => {
    mocks.purgeOldTerminal.mockResolvedValue({
      deleted: 5,
      stopReason: "chunkCap",
    })

    const result = await connectSessionService.purgeExpired({
      retentionDays: 7,
      chunkSize: 500,
      interChunkDelayMs: 100,
      maxChunks: 1000,
    })

    expect(mocks.purgeOldTerminal).toHaveBeenCalledWith({
      retentionDays: 7,
      chunkSize: 500,
      interChunkDelayMs: 100,
      maxChunks: 1000,
    })
    expect(result.deletedTerminal).toBe(5)
    expect(result.terminalPurgeStopReason).toBe("chunkCap")
  })
})

describe("connectSessionService.updateReturnUrl", () => {
  it("sets returnUrl on the given session", async () => {
    const result = await connectSessionService.updateReturnUrl({
      id: "session-1",
      returnUrl: "/channels/messenger/select?session=session-1",
    })
    expect(result.returnUrl).toBe(
      "/channels/messenger/select?session=session-1",
    )
    expect(mocks.updateWhereStatusIn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "session-1",
        values: { returnUrl: "/channels/messenger/select?session=session-1" },
      }),
    )
  })

  it("throws notFound when the session does not exist or is no longer active", async () => {
    mocks.updateWhereStatusIn.mockResolvedValue(undefined)
    await expect(
      connectSessionService.updateReturnUrl({
        id: "missing",
        returnUrl: "/channels/messenger/select?session=missing",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})

describe("connectSessionService.submitInput", () => {
  it("records nextAction on an active session", async () => {
    const nextAction = { type: "wait" } as never
    const result = await connectSessionService.submitInput({
      id: "session-1",
      nextAction,
    })

    expect(result.nextAction).toEqual(nextAction)
    expect(mocks.updateWhereStatusIn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "session-1",
        statuses: expect.arrayContaining([
          "pending",
          "authorized",
          "awaiting_selection",
        ]),
        values: { nextAction },
      }),
    )
  })

  it("throws connectSessionExpired instead of reviving an already-terminal session", async () => {
    mocks.updateWhereStatusIn.mockResolvedValueOnce(undefined)
    mocks.findById.mockResolvedValue(baseSession({ status: "cancelled" }))

    await expect(
      connectSessionService.submitInput({
        id: "session-1",
        nextAction: { type: "wait" } as never,
      }),
    ).rejects.toMatchObject({ code: "connectSessionExpired" })
  })
})
