import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  countActiveByWorkspaceId: vi.fn(async () => 0),
  insert: vi.fn(),
  update: vi.fn(),
  findById: vi.fn(),
  findByIdForWorkspace: vi.fn(),
  findByStateNonceHash: vi.fn(),
  claimTarget: vi.fn(),
  listExpired: vi.fn(async (): Promise<Record<string, unknown>[]> => []),
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
    listExpired: mocks.listExpired,
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
  it("lazily flips an active session past expiresAt to expired", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(
      baseSession({ expiresAt: PAST, status: "pending" }),
    )

    const result = await connectSessionService.findByIdForWorkspace({
      id: "session-1",
      workspaceId: "ws-1",
    })

    expect(result?.status).toBe("expired")
    expect(mocks.update).toHaveBeenCalledWith({
      id: "session-1",
      values: { status: "expired" },
    })
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
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("returns an unexpired session unchanged", async () => {
    mocks.findByIdForWorkspace.mockResolvedValue(baseSession())

    const result = await connectSessionService.findByIdForWorkspace({
      id: "session-1",
      workspaceId: "ws-1",
    })

    expect(result?.status).toBe("pending")
    expect(mocks.update).not.toHaveBeenCalled()
  })
})

describe("connectSessionService.attachAuthorization", () => {
  it("throws connectSessionExpired when the session is not active", async () => {
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
    mocks.findById.mockResolvedValue(baseSession({ status: "pending" }))

    const targets = [{ id: "page-1", name: "Page One", selectable: true }]
    await connectSessionService.attachAuthorization({
      id: "session-1",
      encryptedAuth: { iv: "x", ciphertext: "y", keyId: "k" } as never,
      targets,
    })

    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "session-1",
        values: expect.objectContaining({
          status: "awaiting_selection",
          step: "select",
          targets,
        }),
      }),
    )
  })
})

describe("connectSessionService.claimTarget", () => {
  it("forwards to the repository's atomic claim", async () => {
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
  it("stays awaiting_selection until every target has a result", async () => {
    mocks.findById.mockResolvedValue(
      baseSession({
        status: "awaiting_selection",
        targets: [{ id: "a" }, { id: "b" }],
        results: [],
        resultConnectionIds: [],
      }),
    )

    const result = await connectSessionService.recordResults({
      id: "session-1",
      results: [{ targetId: "a", status: "connected", connectionId: "c1" }],
      resultConnectionIds: ["c1"],
    })

    expect(result.status).not.toBe("completed")
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({ status: "awaiting_selection" }),
      }),
    )
  })

  it("marks completed once accumulated results cover every target", async () => {
    mocks.findById.mockResolvedValue(
      baseSession({
        status: "awaiting_selection",
        targets: [{ id: "a" }, { id: "b" }],
        results: [{ targetId: "a", status: "connected", connectionId: "c1" }],
        resultConnectionIds: ["c1"],
      }),
    )

    const result = await connectSessionService.recordResults({
      id: "session-1",
      results: [{ targetId: "b", status: "connected", connectionId: "c2" }],
      resultConnectionIds: ["c2"],
    })

    expect(result.status).toBe("completed")
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.objectContaining({
          status: "completed",
          resultConnectionIds: ["c1", "c2"],
        }),
      }),
    )
  })
})

describe("connectSessionService.fail / cancel", () => {
  it("fail sets status failed with the given errorCode", async () => {
    const result = await connectSessionService.fail({
      id: "session-1",
      errorCode: "provider_denied",
    })
    expect(result.status).toBe("failed")
    expect(result.errorCode).toBe("provider_denied")
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
})

describe("connectSessionService.purgeExpired", () => {
  it("flips every session listExpired returns to expired and reports the count", async () => {
    mocks.listExpired.mockResolvedValue([
      baseSession({ id: "s1" }),
      baseSession({ id: "s2" }),
    ])

    const count = await connectSessionService.purgeExpired()

    expect(count).toBe(2)
    expect(mocks.update).toHaveBeenCalledWith({
      id: "s1",
      values: { status: "expired" },
    })
    expect(mocks.update).toHaveBeenCalledWith({
      id: "s2",
      values: { status: "expired" },
    })
  })
})

describe("connectSessionService.updateReturnUrl", () => {
  it("sets returnUrl on the given session, referencing its own id", async () => {
    const result = await connectSessionService.updateReturnUrl({
      id: "session-1",
      returnUrl: "/channels/messenger/select?session=session-1",
    })
    expect(result.returnUrl).toBe(
      "/channels/messenger/select?session=session-1",
    )
    expect(mocks.update).toHaveBeenCalledWith({
      id: "session-1",
      values: { returnUrl: "/channels/messenger/select?session=session-1" },
    })
  })

  it("throws notFound when the session does not exist", async () => {
    mocks.update.mockResolvedValue(undefined)
    await expect(
      connectSessionService.updateReturnUrl({
        id: "missing",
        returnUrl: "/channels/messenger/select?session=missing",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})
