import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findByExternalId: vi.fn(),
  getPublicFileUrl: vi.fn((path: string) => `https://files.example/${path}`),
  insertBare: vi.fn(),
  isDatabaseError: vi.fn(() => false),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  markMetadataAttempt: vi.fn(),
  listFilterOptions: vi.fn(),
  resolveTenantSettings: vi.fn(),
  saveMetadata: vi.fn(),
  uploadFileFromUrl: vi.fn(),
  updateIntegrationIfChanged: vi.fn(),
  claimMetadataRetry: vi.fn(),
  incrementPhoneCommentsCount: vi.fn(),
  markPhoneCounted: vi.fn(),
  findListedPostsWithoutThumbnail: vi.fn(),
  saveListedPostThumbnail: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  isDatabaseError: mocks.isDatabaseError,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  channelPostRepository: {
    claimMetadataRetry: mocks.claimMetadataRetry,
    findByExternalId: mocks.findByExternalId,
    incrementPhoneCommentsCount: mocks.incrementPhoneCommentsCount,
    insertBare: mocks.insertBare,
    listFilterOptions: mocks.listFilterOptions,
    markMetadataAttempt: mocks.markMetadataAttempt,
    saveMetadata: mocks.saveMetadata,
    updateIntegrationIfChanged: mocks.updateIntegrationIfChanged,
  },
  findListedPostsWithoutThumbnail: mocks.findListedPostsWithoutThumbnail,
  saveListedPostThumbnail: mocks.saveListedPostThumbnail,
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploadFileFromUrl: mocks.uploadFileFromUrl,
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
}))

vi.mock("../src/logger", () => ({
  logger: { info: mocks.loggerInfo, warn: mocks.loggerWarn },
}))
vi.mock("../src/message/service", () => ({
  messageService: {
    markPhoneCounted: mocks.markPhoneCounted,
  },
}))

vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: mocks.resolveTenantSettings,
}))

vi.mock("../src/utils", () => ({
  getPublicFileUrl: mocks.getPublicFileUrl,
}))

const { channelPostService } = await import("../src/channel-post/service")

const input = {
  externalPostId: "1780",
  fetchDetails: vi.fn(),
  inboxId: "inbox-1",
  integrationId: "integration-1",
  channel: "instagram",
  sourceAccountId: "account-1",
  workspaceId: "workspace-1",
}

describe("channelPostService.resolveForComment", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByExternalId.mockResolvedValue(null)
    mocks.insertBare.mockResolvedValue("post-1")
    mocks.updateIntegrationIfChanged.mockResolvedValue(false)
    mocks.claimMetadataRetry.mockResolvedValue(false)
    mocks.markMetadataAttempt.mockResolvedValue(undefined)
    mocks.listFilterOptions.mockResolvedValue([])
    mocks.saveMetadata.mockResolvedValue(undefined)
    mocks.uploadFileFromUrl.mockResolvedValue({ originPath: "thumbnail.png" })
  })

  test("records the bare post even when metadata hydration fails", async () => {
    input.fetchDetails.mockRejectedValueOnce(new Error("Graph unavailable"))

    await expect(channelPostService.resolveForComment(input)).resolves.toBe(
      "post-1",
    )

    expect(mocks.insertBare).toHaveBeenCalledWith(input)
    expect(mocks.markMetadataAttempt).toHaveBeenCalledWith({
      id: "post-1",
      workspaceId: "workspace-1",
    })
    expect(mocks.loggerWarn).toHaveBeenCalledOnce()
  })

  test("keeps text metadata when the thumbnail re-host fails", async () => {
    input.fetchDetails.mockResolvedValue({
      caption: "A post",
      mediaType: "IMAGE",
      permalink: "https://instagram.com/p/1",
      publishedAt: new Date("2026-09-30T00:00:00.000Z"),
      thumbnailUrl: "https://cdn.example/photo.jpg",
    })
    mocks.uploadFileFromUrl.mockRejectedValueOnce(new Error("too large"))

    await expect(channelPostService.resolveForComment(input)).resolves.toBe(
      "post-1",
    )

    // A failed/oversized thumbnail must not discard the text metadata, and the
    // post must not be marked for retry (metadataFetchedAt gets set on save).
    expect(mocks.saveMetadata).toHaveBeenCalledWith({
      id: "post-1",
      metadata: {
        caption: "A post",
        mediaType: "IMAGE",
        permalink: "https://instagram.com/p/1",
        publishedAt: new Date("2026-09-30T00:00:00.000Z"),
        thumbnail: null,
      },
      workspaceId: "workspace-1",
    })
    expect(mocks.markMetadataAttempt).not.toHaveBeenCalled()
  })

  test("does not record a post after its workspace FK was removed", async () => {
    const foreignKeyError = { cause: { code: "23503" } }
    mocks.insertBare.mockRejectedValueOnce(foreignKeyError)
    mocks.isDatabaseError.mockImplementation(
      (error) => error === foreignKeyError,
    )

    await expect(
      channelPostService.resolveForComment(input),
    ).resolves.toBeNull()

    expect(mocks.loggerInfo).toHaveBeenCalledOnce()
  })

  test("namespaces post lookups and inserts by channel", async () => {
    await channelPostService.resolveForComment({
      ...input,
      channel: "messenger",
    })

    // The same bare id on another channel must resolve to its own row.
    expect(mocks.findByExternalId).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "messenger", externalPostId: "1780" }),
    )
    expect(mocks.insertBare).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "messenger", externalPostId: "1780" }),
    )
  })

  test("uses the conflict winner without fetching metadata a second time", async () => {
    mocks.insertBare.mockResolvedValue(null)
    mocks.findByExternalId.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "post-1",
      integrationId: "integration-1",
      metadataFetchedAt: new Date("2026-09-30T00:00:00.000Z"),
    })

    await expect(channelPostService.resolveForComment(input)).resolves.toBe(
      "post-1",
    )

    expect(mocks.insertBare).toHaveBeenCalledOnce()
    expect(mocks.claimMetadataRetry).not.toHaveBeenCalled()
    expect(input.fetchDetails).not.toHaveBeenCalled()
  })

  test("keeps a hydrated same-integration post on the read-only fast path", async () => {
    mocks.findByExternalId.mockResolvedValue({
      id: "post-1",
      integrationId: "integration-1",
      metadataFetchedAt: new Date("2026-09-30T00:00:00.000Z"),
    })

    await expect(channelPostService.resolveForComment(input)).resolves.toBe(
      "post-1",
    )

    expect(mocks.updateIntegrationIfChanged).not.toHaveBeenCalled()
    expect(mocks.claimMetadataRetry).not.toHaveBeenCalled()
    expect(input.fetchDetails).not.toHaveBeenCalled()
  })

  test("claims a missing-metadata post after reconnecting its integration", async () => {
    mocks.findByExternalId.mockResolvedValue({
      id: "post-1",
      integrationId: "old-integration",
      metadataFetchedAt: null,
    })
    mocks.claimMetadataRetry.mockResolvedValue(true)
    input.fetchDetails.mockResolvedValueOnce({
      caption: "A post",
      publishedAt: null,
      thumbnailUrl: null,
    })

    await expect(channelPostService.resolveForComment(input)).resolves.toBe(
      "post-1",
    )

    expect(mocks.updateIntegrationIfChanged).toHaveBeenCalledWith(input)
    expect(mocks.claimMetadataRetry).toHaveBeenCalledWith({
      id: "post-1",
      maxRetryAgeMs: 24 * 60 * 60 * 1000,
      retryIntervalMs: 10 * 60 * 1000,
      workspaceId: "workspace-1",
    })
    expect(mocks.saveMetadata).toHaveBeenCalledWith({
      id: "post-1",
      metadata: {
        caption: "A post",
        mediaType: null,
        permalink: null,
        publishedAt: null,
        thumbnail: null,
      },
      workspaceId: "workspace-1",
    })
  })

  test("keeps PostgreSQL's timestamp cursor value unchanged", async () => {
    mocks.listFilterOptions.mockResolvedValue([
      {
        caption: "A post",
        externalPostId: "1780",
        id: "post-1",
        inboxId: "inbox-1",
        inboxName: "Instagram",
        channel: "instagram",
        permalink: "https://instagram.com/p/post-1",
        publishedAt: new Date("2026-09-30T00:00:00.000Z"),
        sortAt: "2026-09-30 00:00:00.123456+00",
        thumbnail: null,
      },
      {
        caption: "Another post",
        externalPostId: "1781",
        id: "post-2",
        inboxId: "inbox-1",
        inboxName: "Instagram",
        channel: "instagram",
        permalink: null,
        publishedAt: null,
        sortAt: "2026-09-30 00:00:00.123455+00",
        thumbnail: null,
      },
    ])
    mocks.resolveTenantSettings.mockResolvedValue({
      storageUrl: "https://files.example/",
    })

    await expect(
      channelPostService.listFilterOptions({
        limit: 1,
        workspaceId: "workspace-1",
      }),
    ).resolves.toEqual({
      items: [
        {
          caption: "A post",
          externalPostId: "1780",
          id: "post-1",
          inboxId: "inbox-1",
          inboxName: "Instagram",
          channel: "instagram",
          permalink: "https://instagram.com/p/post-1",
          publishedAt: new Date("2026-09-30T00:00:00.000Z"),
          thumbnailUrl: null,
        },
      ],
      nextCursor: {
        id: "post-1",
        sortAt: "2026-09-30 00:00:00.123456+00",
      },
    })
  })

  test("skips and logs a post whose stored channel is not a known channel", async () => {
    const row = {
      caption: "A post",
      externalPostId: "1780",
      id: "post-1",
      inboxId: "inbox-1",
      inboxName: "Inbox",
      permalink: null,
      publishedAt: null,
      thumbnail: null,
    }
    mocks.listFilterOptions.mockResolvedValue([
      { ...row, channel: "retired-channel", sortAt: "2026-09-30 00:00:00+00" },
      {
        ...row,
        channel: "messenger",
        externalPostId: "1781",
        id: "post-2",
        sortAt: "2026-09-29 00:00:00+00",
      },
    ])
    mocks.resolveTenantSettings.mockResolvedValue({
      storageUrl: "https://files.example/",
    })

    const result = await channelPostService.listFilterOptions({
      limit: 5,
      workspaceId: "workspace-1",
    })

    // One bad row never fails the picker; the valid post is still returned.
    expect(result.items.map((item) => item.id)).toEqual(["post-2"])
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ channelPostId: "post-1" }),
      expect.stringContaining("unknown channel"),
    )
  })

  test("bounds a hanging metadata fetch and retains the bare post", async () => {
    vi.useFakeTimers()
    input.fetchDetails.mockImplementation(
      () => new Promise<never>(() => undefined),
    )

    const resolving = channelPostService.resolveForComment(input)
    await vi.advanceTimersByTimeAsync(15_000)

    await expect(resolving).resolves.toBe("post-1")
    expect(mocks.markMetadataAttempt).toHaveBeenCalledWith({
      id: "post-1",
      workspaceId: "workspace-1",
    })

    vi.useRealTimers()
  })
})

describe("channelPostService.resolveForCommentWithSettings", () => {
  const storedPost = {
    hideComments: true,
    hidePhoneComments: false,
    id: "post-9",
    integrationId: "integration-1",
    liveStatus: null,
    metadataFetchedAt: new Date("2026-11-01T00:00:00.000Z"),
    skipComments: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByExternalId.mockResolvedValue(null)
    mocks.insertBare.mockResolvedValue("post-1")
    mocks.updateIntegrationIfChanged.mockResolvedValue(false)
    mocks.claimMetadataRetry.mockResolvedValue(false)
    mocks.saveMetadata.mockResolvedValue(undefined)
  })

  test("returns the stored switches of an existing post from the same read", async () => {
    mocks.findByExternalId.mockResolvedValue(storedPost)

    await expect(
      channelPostService.resolveForCommentWithSettings(input),
    ).resolves.toEqual({
      id: "post-9",
      liveStatus: null,
      settings: {
        hideComments: true,
        hidePhoneComments: false,
        skipComments: true,
      },
    })
    expect(mocks.findByExternalId).toHaveBeenCalledTimes(1)
  })

  test("a post just recorded from its first comment has every switch off", async () => {
    input.fetchDetails.mockResolvedValue({})

    await expect(
      channelPostService.resolveForCommentWithSettings(input),
    ).resolves.toEqual({
      id: "post-1",
      liveStatus: null,
      settings: {
        hideComments: false,
        hidePhoneComments: false,
        skipComments: false,
      },
    })
  })

  test("a post a concurrent comment recorded first returns that row's switches", async () => {
    mocks.insertBare.mockResolvedValueOnce(null)
    mocks.findByExternalId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(storedPost)

    const resolved =
      await channelPostService.resolveForCommentWithSettings(input)

    expect(resolved?.id).toBe("post-9")
    expect(resolved?.settings.hideComments).toBe(true)
  })

  test("returns the stored live status so a live comment can skip a no-op write", async () => {
    mocks.findByExternalId.mockResolvedValue({
      ...storedPost,
      liveStatus: "live",
    })

    const resolved =
      await channelPostService.resolveForCommentWithSettings(input)

    expect(resolved?.liveStatus).toBe("live")
  })

  test("resolveForComment still answers just the id", async () => {
    mocks.findByExternalId.mockResolvedValue(storedPost)

    await expect(channelPostService.resolveForComment(input)).resolves.toBe(
      "post-9",
    )
  })

  describe("recordPhoneComment", () => {
    const comment = {
      createdAt: new Date("2026-11-22T10:00:00.123Z"),
      id: "m1",
    }
    const record = () =>
      channelPostService.recordPhoneComment({
        comment,
        id: "post-9",
        workspaceId: "workspace-1",
      })
    const mark = {
      createdAt: comment.createdAt,
      id: "m1",
      workspaceId: "workspace-1",
    }

    beforeEach(() => {
      mocks.markPhoneCounted.mockResolvedValue(true)
      mocks.incrementPhoneCommentsCount.mockResolvedValue(undefined)
    })

    test("marks the comment and then counts it on the post", async () => {
      await record()

      expect(mocks.markPhoneCounted).toHaveBeenCalledWith(mark)
      expect(mocks.incrementPhoneCommentsCount).toHaveBeenCalledWith({
        id: "post-9",
        workspaceId: "workspace-1",
      })
    })

    test("a comment that is already marked counts nothing", async () => {
      mocks.markPhoneCounted.mockResolvedValue(false)

      await record()

      expect(mocks.incrementPhoneCommentsCount).not.toHaveBeenCalled()
    })

    test("a failed count fails the call but never takes the mark back", async () => {
      mocks.incrementPhoneCommentsCount.mockRejectedValueOnce(
        new Error("db down"),
      )

      await expect(record()).rejects.toThrow("db down")

      // The outcome of the failed write is unknown, so the mark stays: undoing
      // it could count the comment twice. The count may fall short (and is
      // repaired from the comments on a refresh), never run over.
      expect(
        (mocks as Record<string, unknown>).unmarkPhoneCounted,
      ).toBeUndefined()
    })

    test("the retry of a failed count finds the mark and adds nothing, so the count never runs over", async () => {
      mocks.incrementPhoneCommentsCount.mockRejectedValueOnce(
        new Error("db down"),
      )
      await expect(record()).rejects.toThrow("db down")

      mocks.markPhoneCounted.mockResolvedValue(false)
      await record()

      expect(mocks.incrementPhoneCommentsCount).toHaveBeenCalledTimes(1)
    })

    test("a storage failure on the mark propagates and counts nothing", async () => {
      mocks.markPhoneCounted.mockRejectedValueOnce(new Error("shard down"))

      await expect(record()).rejects.toThrow("shard down")
      expect(mocks.incrementPhoneCommentsCount).not.toHaveBeenCalled()
    })
  })
})

describe("channelPostService.rehostListedThumbnails", () => {
  const posts = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      externalPostId: `ext-${index}`,
      thumbnailUrl: `https://cdn.example/${index}.jpg`,
    }))
  const missing = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      externalPostId: `ext-${index}`,
      id: `post-${index}`,
    }))

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.saveListedPostThumbnail.mockResolvedValue(undefined)
    mocks.uploadFileFromUrl.mockResolvedValue({ originPath: "thumbnail.png" })
  })

  test("downloads and stores a thumbnail only for the listed posts that have none", async () => {
    mocks.findListedPostsWithoutThumbnail.mockResolvedValue(missing(2))

    await channelPostService.rehostListedThumbnails({
      channel: "messenger",
      deadline: Date.now() + 60_000,
      posts: posts(5),
      workspaceId: "workspace-1",
    })

    expect(mocks.findListedPostsWithoutThumbnail).toHaveBeenCalledWith({
      channel: "messenger",
      externalPostIds: ["ext-0", "ext-1", "ext-2", "ext-3", "ext-4"],
      workspaceId: "workspace-1",
    })
    expect(mocks.uploadFileFromUrl).toHaveBeenCalledTimes(2)
    expect(mocks.saveListedPostThumbnail).toHaveBeenCalledWith({
      id: "post-0",
      thumbnail: "thumbnail.png",
      workspaceId: "workspace-1",
    })
  })

  test("never looks up a post whose listing carried no thumbnail url", async () => {
    mocks.findListedPostsWithoutThumbnail.mockResolvedValue([])

    await channelPostService.rehostListedThumbnails({
      channel: "messenger",
      deadline: Date.now() + 60_000,
      posts: [
        { externalPostId: "a", thumbnailUrl: null },
        { externalPostId: "b", thumbnailUrl: "https://cdn.example/b.jpg" },
      ],
      workspaceId: "workspace-1",
    })

    expect(mocks.findListedPostsWithoutThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({ externalPostIds: ["b"] }),
    )
  })

  test("downloads at most five at a time", async () => {
    mocks.findListedPostsWithoutThumbnail.mockResolvedValue(missing(12))
    let running = 0
    let peak = 0
    mocks.uploadFileFromUrl.mockImplementation(async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 5))
      running -= 1
      return { originPath: "thumbnail.png" }
    })

    await channelPostService.rehostListedThumbnails({
      channel: "messenger",
      deadline: Date.now() + 60_000,
      posts: posts(12),
      workspaceId: "workspace-1",
    })

    expect(mocks.uploadFileFromUrl).toHaveBeenCalledTimes(12)
    expect(peak).toBe(5)
  })

  test("stops starting downloads once the deadline has passed", async () => {
    mocks.findListedPostsWithoutThumbnail.mockResolvedValue(missing(10))

    await channelPostService.rehostListedThumbnails({
      channel: "messenger",
      deadline: Date.now() - 1,
      posts: posts(10),
      workspaceId: "workspace-1",
    })

    expect(mocks.uploadFileFromUrl).not.toHaveBeenCalled()
  })

  test("a failed download is logged and leaves the post without a thumbnail, never throws", async () => {
    mocks.findListedPostsWithoutThumbnail.mockResolvedValue(missing(2))
    mocks.uploadFileFromUrl
      .mockRejectedValueOnce(new Error("too large"))
      .mockResolvedValueOnce({ originPath: "ok.png" })

    await expect(
      channelPostService.rehostListedThumbnails({
        channel: "messenger",
        deadline: Date.now() + 60_000,
        posts: posts(2),
        workspaceId: "workspace-1",
      }),
    ).resolves.toBeUndefined()

    expect(mocks.saveListedPostThumbnail).toHaveBeenCalledTimes(1)
    expect(mocks.saveListedPostThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({ id: "post-1", thumbnail: "ok.png" }),
    )
  })

  test("a failed lookup or a failed save is swallowed, never throws", async () => {
    mocks.findListedPostsWithoutThumbnail.mockRejectedValueOnce(
      new Error("db down"),
    )
    await expect(
      channelPostService.rehostListedThumbnails({
        channel: "messenger",
        deadline: Date.now() + 60_000,
        posts: posts(1),
        workspaceId: "workspace-1",
      }),
    ).resolves.toBeUndefined()
    expect(mocks.uploadFileFromUrl).not.toHaveBeenCalled()

    mocks.findListedPostsWithoutThumbnail.mockResolvedValue(missing(2))
    mocks.saveListedPostThumbnail
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValueOnce(undefined)
    await expect(
      channelPostService.rehostListedThumbnails({
        channel: "messenger",
        deadline: Date.now() + 60_000,
        posts: posts(2),
        workspaceId: "workspace-1",
      }),
    ).resolves.toBeUndefined()
    expect(mocks.saveListedPostThumbnail).toHaveBeenCalledTimes(2)
  })
})
