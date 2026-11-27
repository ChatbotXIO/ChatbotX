import { beforeEach, describe, expect, test, vi } from "vitest"

const mockListTiktokComments = vi.fn()
const mockRefreshAccessToken = vi.fn()
const mockBuildContext = vi.fn()

vi.mock("@chatbotx.io/integration-tiktok/apis/comment", () => ({
  listTiktokComments: mockListTiktokComments,
}))

vi.mock(
  "@chatbotx.io/integration-tiktok/apis/auth",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    refreshAccessToken: mockRefreshAccessToken,
  }),
)

const mockTiktokIntegrationService = {
  rememberOwnerUniqueIdentifier: vi.fn(),
  markCommentIdentityWithheld: vi.fn(),
  findCommentIdentityWithheld: vi.fn(),
  clearCommentIdentityWithheld: vi.fn(),
}

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mockBuildContext,
  tiktokIntegrationService: mockTiktokIntegrationService,
}))

const mockIntegrationQueueAdd = vi.fn()

vi.mock("@chatbotx.io/worker-config", () => ({
  IntegrationJobAction: { incomingComment: "incomingComment" },
  integrationQueue: { add: mockIntegrationQueueAdd },
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const { TiktokAuthException } = await import("@chatbotx.io/integration-tiktok")
const { resolveTiktokAuthorship } = await import(
  "../src/integration/handlers/tiktok-comment-authorship"
)
const {
  findTiktokCommentToRecheck,
  rememberTiktokOwnerIdentifier,
  resolveTiktokCommenterIdentity,
  settleTiktokRecheck,
  TIKTOK_IDENTITY_RECHECK_DELAYS_MS,
  withholdTiktokComment,
} = await import("../src/integration/handlers/tiktok-comment-identity")

const HOUR_MS = 60 * 60 * 1000
const COMMENT_ID = "7689768556360614677"
const VIDEO_ID = "7687198531685207314"

const buildAuth = (overrides: {
  accessToken?: string
  expiresAt?: string
}) => ({
  authType: "oauth2" as const,
  clientId: "client-id",
  clientSecret: "client-secret",
  tokens: {
    accessToken: overrides.accessToken ?? "old-access-token",
    refreshToken: "old-refresh-token",
    expiresAt:
      overrides.expiresAt ?? new Date(Date.now() + 12 * HOUR_MS).toISOString(),
  },
  metadata: { openId: "open-id-1" },
})

/** An auth store backed by one in-memory row, like the integration's `auth` column. */
const inMemoryAuthStore = (initial: ReturnType<typeof buildAuth>) => {
  let stored: unknown = initial
  return {
    load: vi.fn(() => Promise.resolve(stored)),
    save: vi.fn((auth: unknown) => {
      stored = auth
      return Promise.resolve()
    }),
    withLock: <T>(fn: () => Promise<T>) => fn(),
    markOffline: vi.fn(),
  }
}

const freshTokens = {
  access_token: "new-access-token",
  refresh_token: "new-refresh-token",
  expires_in: 86_400,
  refresh_expires_in: 26_006_009,
  open_id: "open-id-1",
  scope: "comment.list,comment.list.manage",
}

const commentResult = {
  comments: [
    {
      comment_id: COMMENT_ID,
      video_id: VIDEO_ID,
      username: "commenter",
      image_url: "https://p16.tiktokcdn.test/comment-image.jpeg",
    },
  ],
}

const setUpContext = (auth: ReturnType<typeof buildAuth>) => {
  const authStore = inMemoryAuthStore(auth)
  mockBuildContext.mockResolvedValue({ auth, authStore })
  return authStore
}

const lookup = (auth: ReturnType<typeof buildAuth>) =>
  resolveTiktokCommenterIdentity({
    workspaceId: "workspace-1",
    integrationRow: {
      id: "integration-1",
      inboxId: "inbox-1",
      auth: auth as never,
    },
    commentId: COMMENT_ID,
    videoId: VIDEO_ID,
  })

describe("resolveTiktokCommenterIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRefreshAccessToken.mockResolvedValue(freshTokens)
  })

  test("returns the comment's image_url", async () => {
    const auth = buildAuth({})
    setUpContext(auth)
    mockListTiktokComments.mockResolvedValue(commentResult)

    await expect(lookup(auth)).resolves.toEqual(
      expect.objectContaining({
        imageUrl: "https://p16.tiktokcdn.test/comment-image.jpeg",
        isOwner: false,
      }),
    )
    expect(mockListTiktokComments).toHaveBeenCalledWith(
      "old-access-token",
      expect.objectContaining({
        businessId: "open-id-1",
        videoId: VIDEO_ID,
        commentIds: [COMMENT_ID],
      }),
    )
    expect(mockRefreshAccessToken).not.toHaveBeenCalled()
  })

  test("leaves imageUrl undefined for a text comment", async () => {
    const auth = buildAuth({})
    setUpContext(auth)
    mockListTiktokComments.mockResolvedValue({
      comments: [{ comment_id: COMMENT_ID, video_id: VIDEO_ID, image_url: "" }],
    })

    const identity = await lookup(auth)

    expect(identity?.imageUrl).toBeUndefined()
  })

  test("refreshes and retries once when TikTok rejects the access token (#1754)", async () => {
    const auth = buildAuth({})
    const authStore = setUpContext(auth)
    mockListTiktokComments
      .mockRejectedValueOnce(
        new TiktokAuthException(
          "Access token is incorrect or has been revoked.",
          401,
          40_105,
        ),
      )
      .mockResolvedValueOnce(commentResult)

    const identity = await lookup(auth)

    expect(identity?.username).toBe("commenter")
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1)
    expect(mockRefreshAccessToken).toHaveBeenCalledWith(
      { clientId: "client-id", clientSecret: "client-secret" },
      "old-refresh-token",
    )
    expect(mockListTiktokComments).toHaveBeenLastCalledWith(
      "new-access-token",
      expect.anything(),
    )
    // TikTok rotates refresh tokens: the new one must be what is stored.
    expect(authStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: expect.objectContaining({
          accessToken: "new-access-token",
          refreshToken: "new-refresh-token",
        }),
      }),
    )
  })

  test("refreshes before calling when the token is about to expire", async () => {
    const auth = buildAuth({
      expiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
    })
    setUpContext(auth)
    mockListTiktokComments.mockResolvedValue(commentResult)

    await lookup(auth)

    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1)
    expect(mockListTiktokComments).toHaveBeenCalledTimes(1)
    expect(mockListTiktokComments).toHaveBeenCalledWith(
      "new-access-token",
      expect.anything(),
    )
  })

  test("returns undefined, never throws, when the retry fails too", async () => {
    const auth = buildAuth({})
    setUpContext(auth)
    mockListTiktokComments.mockRejectedValue(
      new TiktokAuthException("Access token is incorrect", 401, 40_105),
    )

    await expect(lookup(auth)).resolves.toBeUndefined()
    expect(mockListTiktokComments).toHaveBeenCalledTimes(2)
  })
})

describe("resolveTiktokAuthorship", () => {
  const OWNER_ID = "+Owner/Unique1"
  const COMMENTER_ID = "+Commenter/Unique2"

  test("the lookup's owner flag decides when there is one", () => {
    expect(
      resolveTiktokAuthorship({
        identity: { isOwner: true },
        fromId: COMMENTER_ID,
        ownerUniqueIdentifier: undefined,
      }),
    ).toBe("owner")
    expect(
      resolveTiktokAuthorship({
        identity: { isOwner: false },
        fromId: OWNER_ID,
        ownerUniqueIdentifier: OWNER_ID,
      }),
    ).toBe("commenter")
  })

  // Without the lookup and without a remembered id, answering might be the
  // account replying to itself.
  test("is unknown when the lookup missed and the account's id is not known yet", () => {
    expect(
      resolveTiktokAuthorship({
        identity: undefined,
        fromId: COMMENTER_ID,
        ownerUniqueIdentifier: undefined,
      }),
    ).toBe("unknown")
  })

  // #1715: a lookup that misses (photo posts) no longer withholds the
  // automation once the account's own id has been learned.
  test("falls back to the remembered account id when the lookup missed", () => {
    expect(
      resolveTiktokAuthorship({
        identity: undefined,
        fromId: COMMENTER_ID,
        ownerUniqueIdentifier: OWNER_ID,
      }),
    ).toBe("commenter")
    expect(
      resolveTiktokAuthorship({
        identity: undefined,
        fromId: OWNER_ID,
        ownerUniqueIdentifier: OWNER_ID,
      }),
    ).toBe("owner")
  })
})

describe("rememberTiktokOwnerIdentifier", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const row = (ownerUniqueIdentifier?: string) => ({
    id: "integration-1",
    auth: {
      metadata: { openId: "open-id-1", ownerUniqueIdentifier },
    } as never,
  })

  test("stores the id the first time", async () => {
    await rememberTiktokOwnerIdentifier({
      integrationRow: row(),
      workspaceId: "workspace-1",
      uniqueIdentifier: "+Owner/Unique1",
    })

    expect(
      mockTiktokIntegrationService.rememberOwnerUniqueIdentifier,
    ).toHaveBeenCalledWith({
      id: "integration-1",
      workspaceId: "workspace-1",
      uniqueIdentifier: "+Owner/Unique1",
    })
  })

  test("skips the write when the same id is already stored", async () => {
    await rememberTiktokOwnerIdentifier({
      integrationRow: row("+Owner/Unique1"),
      workspaceId: "workspace-1",
      uniqueIdentifier: "+Owner/Unique1",
    })

    expect(
      mockTiktokIntegrationService.rememberOwnerUniqueIdentifier,
    ).not.toHaveBeenCalled()
  })

  test("never throws when the write fails", async () => {
    mockTiktokIntegrationService.rememberOwnerUniqueIdentifier.mockRejectedValueOnce(
      new Error("db down"),
    )

    await expect(
      rememberTiktokOwnerIdentifier({
        integrationRow: row(),
        workspaceId: "workspace-1",
        uniqueIdentifier: "+Owner/Unique1",
      }),
    ).resolves.toBeUndefined()
  })
})

describe("TikTok identity re-checks", () => {
  const commentData = {
    commentId: COMMENT_ID,
    postId: VIDEO_ID,
    fromId: "+Commenter/Unique2",
    message: "bac",
    createdTime: 1_783_674_105,
  }
  const jobData = {
    integrationType: "tiktok",
    integrationIdentifier: "open-id-1",
    commentData,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockTiktokIntegrationService.markCommentIdentityWithheld.mockResolvedValue(
      undefined,
    )
    mockIntegrationQueueAdd.mockResolvedValue(undefined)
  })

  test("a first withhold marks the comment and schedules the first re-check", async () => {
    await withholdTiktokComment(jobData)

    expect(
      mockTiktokIntegrationService.markCommentIdentityWithheld,
    ).toHaveBeenCalledWith({
      integrationIdentifier: "open-id-1",
      commentId: COMMENT_ID,
      comment: commentData,
    })
    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "incomingComment",
      {
        type: "incomingComment",
        data: {
          ...jobData,
          tiktokIdentityRecheck: { source: "retry", attempt: 1 },
        },
      },
      {
        delay: TIKTOK_IDENTITY_RECHECK_DELAYS_MS[0],
        jobId: `tiktok-identity-recheck-${COMMENT_ID}-1`,
      },
    )
  })

  test("a re-check that misses again schedules the next one", async () => {
    await withholdTiktokComment({
      ...jobData,
      tiktokIdentityRecheck: { source: "retry", attempt: 1 },
    })

    expect(mockIntegrationQueueAdd).toHaveBeenCalledWith(
      "incomingComment",
      expect.objectContaining({
        data: expect.objectContaining({
          tiktokIdentityRecheck: { source: "retry", attempt: 2 },
        }),
      }),
      {
        delay: TIKTOK_IDENTITY_RECHECK_DELAYS_MS[1],
        jobId: `tiktok-identity-recheck-${COMMENT_ID}-2`,
      },
    )
  })

  test("stops scheduling after the last re-check", async () => {
    await withholdTiktokComment({
      ...jobData,
      tiktokIdentityRecheck: {
        source: "retry",
        attempt: TIKTOK_IDENTITY_RECHECK_DELAYS_MS.length,
      },
    })

    expect(
      mockTiktokIntegrationService.markCommentIdentityWithheld,
    ).toHaveBeenCalled()
    expect(mockIntegrationQueueAdd).not.toHaveBeenCalled()
  })

  // The chain the first delivery started is still running.
  test("a set_to_public re-check that misses does not start a second chain", async () => {
    await withholdTiktokComment({
      ...jobData,
      tiktokIdentityRecheck: { source: "visibility" },
    })

    expect(
      mockTiktokIntegrationService.markCommentIdentityWithheld,
    ).toHaveBeenCalled()
    expect(mockIntegrationQueueAdd).not.toHaveBeenCalled()
  })

  // A re-check without the mark would stop at once.
  test("schedules nothing when the comment cannot be marked", async () => {
    mockTiktokIntegrationService.markCommentIdentityWithheld.mockRejectedValueOnce(
      new Error("redis down"),
    )

    await expect(withholdTiktokComment(jobData)).resolves.toBeUndefined()
    expect(mockIntegrationQueueAdd).not.toHaveBeenCalled()
  })

  test("returns the stored comment for a re-check that is still due", async () => {
    mockTiktokIntegrationService.findCommentIdentityWithheld.mockResolvedValueOnce(
      commentData,
    )

    await expect(
      findTiktokCommentToRecheck({
        integrationIdentifier: "open-id-1",
        commentId: COMMENT_ID,
      }),
    ).resolves.toEqual(commentData)
  })

  test("returns undefined once the comment is settled, or when Redis fails", async () => {
    mockTiktokIntegrationService.findCommentIdentityWithheld
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error("redis down"))
    const props = { integrationIdentifier: "open-id-1", commentId: COMMENT_ID }

    await expect(findTiktokCommentToRecheck(props)).resolves.toBeUndefined()
    await expect(findTiktokCommentToRecheck(props)).resolves.toBeUndefined()
  })

  test("settling clears the mark and never throws", async () => {
    mockTiktokIntegrationService.clearCommentIdentityWithheld.mockRejectedValueOnce(
      new Error("redis down"),
    )

    await expect(
      settleTiktokRecheck({
        integrationIdentifier: "open-id-1",
        commentId: COMMENT_ID,
      }),
    ).resolves.toBeUndefined()
    expect(
      mockTiktokIntegrationService.clearCommentIdentityWithheld,
    ).toHaveBeenCalledWith({
      integrationIdentifier: "open-id-1",
      commentId: COMMENT_ID,
    })
  })
})
