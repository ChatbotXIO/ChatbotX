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

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mockBuildContext,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

const { TiktokAuthException } = await import("@chatbotx.io/integration-tiktok")
const { resolveTiktokCommenterIdentity } = await import(
  "../src/integration/handlers/tiktok-comment-identity"
)

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
