import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  addToPosts: vi.fn(),
  findById: vi.fn(),
  findChannels: vi.fn(),
  findExistingPostIds: vi.fn(),
  findExistingTopicIds: vi.fn(),
  findPostsOverTopicLimit: vi.fn(),
  getPublicFileUrl: vi.fn((path: string) => `https://files.example/${path}`),
  isForeignKeyViolationError: vi.fn(() => false),
  lockExistingIds: vi.fn(),
  list: vi.fn(),
  listAuthors: vi.fn(),
  listForPosts: vi.fn(),
  loggerWarn: vi.fn(),
  removeFromPosts: vi.fn(),
  replaceForPosts: vi.fn(),
  resolveTenantSettings: vi.fn(),
  updateSettings: vi.fn(),
}))

const tx = { kind: "tx" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: async (run: (client: typeof tx) => Promise<unknown>) =>
      await run(tx),
  },
  isForeignKeyViolationError: mocks.isForeignKeyViolationError,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  channelPostManagementRepository: {
    findById: mocks.findById,
    findChannelsByIds: mocks.findChannels,
    findExistingIds: mocks.findExistingPostIds,
    list: mocks.list,
    listAuthors: mocks.listAuthors,
    lockExistingIds: mocks.lockExistingIds,
    updateSettings: mocks.updateSettings,
  },
  postTopicRepository: {
    addToPosts: mocks.addToPosts,
    findExistingIds: mocks.findExistingTopicIds,
    findPostsOverTopicLimit: mocks.findPostsOverTopicLimit,
    listForPosts: mocks.listForPosts,
    removeFromPosts: mocks.removeFromPosts,
    replaceForPosts: mocks.replaceForPosts,
  },
}))

vi.mock("@chatbotx.io/redis", () => ({ invalidateCacheByTags: vi.fn() }))
vi.mock("../src/logger", () => ({ logger: { warn: mocks.loggerWarn } }))
vi.mock("../src/platform/settings", () => ({
  resolveTenantSettings: mocks.resolveTenantSettings,
}))
vi.mock("../src/utils", () => ({ getPublicFileUrl: mocks.getPublicFileUrl }))

const {
  MAX_BULK_UPDATE_POSTS,
  MAX_TOPICS_PER_POST,
  channelPostManagementService,
} = await import("../src/channel-post/management.service")

const row = (overrides: Record<string, unknown> = {}) => ({
  authorExternalId: null,
  authorName: "Page owner",
  caption: "Hello",
  channel: "messenger",
  commentsCount: 3,
  contentType: "photo",
  engagementCount: 5,
  externalPostId: "ext-1",
  hideComments: false,
  hidePhoneComments: false,
  id: "1",
  inboxId: "10",
  inboxName: "Shop",
  liveStatus: null,
  mediaType: "image",
  metricsFetchedAt: null,
  permalink: null,
  phoneCommentsCount: 0,
  publishedAt: null,
  reactionsCount: 1,
  sharesCount: 1,
  skipComments: false,
  sortValue: "2026-11-22 14:04:24.123456+00",
  thumbnail: "thumb.png",
  viewsCount: null,
  ...overrides,
})

const listInput = {
  filters: { hasComments: true },
  limit: 2,
  sort: "newest" as const,
  workspaceId: "ws-1",
}

describe("channelPostManagementService.list", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.list.mockResolvedValue([])
    mocks.listForPosts.mockResolvedValue([])
    mocks.resolveTenantSettings.mockResolvedValue({ storageUrl: "s3" })
  })

  test("returns a next cursor from the extra row and drops that row", async () => {
    mocks.list.mockResolvedValue([
      row({ id: "3", sortValue: "2026-11-22 14:00:00+00" }),
      row({ id: "2", sortValue: "2026-11-22 13:00:00+00" }),
      row({ id: "1", sortValue: "2026-11-22 12:00:00+00" }),
    ])

    const result = await channelPostManagementService.list(listInput)

    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 3 }),
    )
    expect(result.items.map((item) => item.id)).toEqual(["3", "2"])
    expect(result.nextCursor).toEqual({
      id: "2",
      sort: "newest",
      sortValue: "2026-11-22 13:00:00+00",
    })
  })

  test("omits the cursor on the last page", async () => {
    mocks.list.mockResolvedValue([row()])

    const result = await channelPostManagementService.list(listInput)

    expect(result.nextCursor).toBeUndefined()
  })

  test("loads the topics of the whole page in one query", async () => {
    mocks.list.mockResolvedValue([row({ id: "1" }), row({ id: "2" })])
    mocks.listForPosts.mockResolvedValue([
      { channelPostId: "1", color: "#112233", id: "7", name: "Sale" },
      { channelPostId: "1", color: null, id: "8", name: "VIP" },
    ])

    const result = await channelPostManagementService.list(listInput)

    expect(mocks.listForPosts).toHaveBeenCalledTimes(1)
    expect(mocks.listForPosts).toHaveBeenCalledWith({
      channelPostIds: ["1", "2"],
    })
    expect(result.items[0]?.topics).toEqual([
      { color: "#112233", id: "7", name: "Sale" },
      { color: null, id: "8", name: "VIP" },
    ])
    expect(result.items[1]?.topics).toEqual([])
  })

  test("maps the thumbnail to a public url", async () => {
    mocks.list.mockResolvedValue([row()])

    const result = await channelPostManagementService.list(listInput)

    expect(result.items[0]?.thumbnailUrl).toBe(
      "https://files.example/thumb.png",
    )
    expect(result.items[0]).not.toHaveProperty("sortValue")
  })

  test("skips a post of an unknown channel and logs it", async () => {
    mocks.list.mockResolvedValue([
      row({ channel: "retired" }),
      row({ id: "2" }),
    ])

    const result = await channelPostManagementService.list(listInput)

    expect(result.items.map((item) => item.id)).toEqual(["2"])
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })

  test("reads an unrecognised stored content type as null", async () => {
    mocks.list.mockResolvedValue([row({ contentType: "hologram" })])

    const result = await channelPostManagementService.list(listInput)

    expect(result.items[0]?.contentType).toBeNull()
  })

  test("does not touch topics or settings when the page is empty", async () => {
    const result = await channelPostManagementService.list(listInput)

    expect(result).toEqual({ items: [] })
    expect(mocks.listForPosts).not.toHaveBeenCalled()
    expect(mocks.resolveTenantSettings).not.toHaveBeenCalled()
  })

  test.each([
    ["newest", "12"],
    ["newest", "not-a-time"],
    ["newest", "2026-13-45 10:00:00+00"],
    ["mostComments", "2026-11-22 14:00:00+00"],
    ["mostComments", "9223372036854775808"],
    ["fewestShares", "-1"],
  ] as const)("rejects a %s cursor whose value is %s", async (sort, sortValue) => {
    await expect(
      channelPostManagementService.list({
        ...listInput,
        cursor: { id: "1", sort, sortValue },
        sort,
      }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.list).not.toHaveBeenCalled()
  })

  test.each([
    ["mostComments", "mostShares"],
    ["mostComments", "fewestComments"],
    ["newest", "mostComments"],
    ["fewestPhones", "mostPhones"],
  ] as const)("rejects a cursor minted under %s when replayed under %s", async (mintedUnder, replayedUnder) => {
    await expect(
      channelPostManagementService.list({
        ...listInput,
        cursor: {
          id: "1",
          sort: mintedUnder,
          sortValue: mintedUnder === "newest" ? "2026-11-22 14:00:00+00" : "7",
        },
        sort: replayedUnder,
      }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.list).not.toHaveBeenCalled()
  })

  test("accepts a count cursor past int32, as the counts are bigint", async () => {
    await channelPostManagementService.list({
      ...listInput,
      cursor: { id: "1", sort: "mostComments", sortValue: "99999999999" },
      sort: "mostComments",
    })

    expect(mocks.list).toHaveBeenCalled()
  })

  test("accepts a cursor that matches the sort", async () => {
    await channelPostManagementService.list({
      ...listInput,
      cursor: { id: "1", sort: "mostPhones", sortValue: "7" },
      sort: "mostPhones",
    })

    expect(mocks.list).toHaveBeenCalled()
  })
})

describe("channelPostManagementService.get", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listForPosts.mockResolvedValue([])
    mocks.resolveTenantSettings.mockResolvedValue({ storageUrl: "s3" })
  })

  test("returns the post with its topics", async () => {
    mocks.findById.mockResolvedValue(row())

    const item = await channelPostManagementService.get({
      id: "1",
      workspaceId: "ws-1",
    })

    expect(item.id).toBe("1")
    expect(mocks.findById).toHaveBeenCalledWith({
      id: "1",
      workspaceId: "ws-1",
    })
  })

  test("is not found for a post of another workspace or a removed post", async () => {
    mocks.findById.mockResolvedValue(null)

    await expect(
      channelPostManagementService.get({ id: "1", workspaceId: "ws-1" }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})

describe("channelPostManagementService.update", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findChannels.mockResolvedValue(["messenger"])
    mocks.findById.mockResolvedValue(row())
    mocks.findExistingPostIds.mockResolvedValue(["1"])
    mocks.lockExistingIds.mockResolvedValue(["1"])
    mocks.findExistingTopicIds.mockImplementation(
      async ({ ids }: { ids: string[] }) => ids,
    )
    mocks.findPostsOverTopicLimit.mockResolvedValue([])
    mocks.listForPosts.mockResolvedValue([])
    mocks.resolveTenantSettings.mockResolvedValue({ storageUrl: "s3" })
  })

  test("replaces the topics inside one transaction", async () => {
    await channelPostManagementService.update({
      id: "1",
      topicIds: ["7", "8"],
      workspaceId: "ws-1",
    })

    expect(mocks.replaceForPosts).toHaveBeenCalledWith(
      { channelPostIds: ["1"], topicIds: ["7", "8"] },
      tx,
    )
    expect(mocks.lockExistingIds).toHaveBeenCalledWith(
      { ids: ["1"], workspaceId: "ws-1" },
      tx,
    )
  })

  test("changes the switches and the topics in the same transaction", async () => {
    await channelPostManagementService.update({
      id: "1",
      settings: { hideComments: true, skipComments: false },
      topicIds: ["7"],
      workspaceId: "ws-1",
    })

    expect(mocks.updateSettings).toHaveBeenCalledWith(
      {
        ids: ["1"],
        patch: { hideComments: true, skipComments: false },
        workspaceId: "ws-1",
      },
      tx,
    )
    expect(mocks.replaceForPosts).toHaveBeenCalledWith(
      { channelPostIds: ["1"], topicIds: ["7"] },
      tx,
    )
  })

  test("rejects a comment switch on a channel without comment settings", async () => {
    mocks.findChannels.mockResolvedValue(["threads"])

    await expect(
      channelPostManagementService.update({
        id: "1",
        settings: { hideComments: true },
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation", field: "settings" })
    expect(mocks.updateSettings).not.toHaveBeenCalled()
  })

  test("still allows a topic-only update on a channel without comment settings", async () => {
    mocks.findChannels.mockResolvedValue(["tiktok"])

    await channelPostManagementService.update({
      id: "1",
      topicIds: ["7"],
      workspaceId: "ws-1",
    })

    expect(mocks.findChannels).not.toHaveBeenCalled()
    expect(mocks.replaceForPosts).toHaveBeenCalled()
  })

  test("changing only a switch locks the post and leaves the topics alone", async () => {
    await channelPostManagementService.update({
      id: "1",
      settings: { hidePhoneComments: true },
      workspaceId: "ws-1",
    })

    expect(mocks.lockExistingIds).toHaveBeenCalled()
    expect(mocks.updateSettings).toHaveBeenCalledWith(
      {
        ids: ["1"],
        patch: { hidePhoneComments: true },
        workspaceId: "ws-1",
      },
      tx,
    )
    expect(mocks.replaceForPosts).not.toHaveBeenCalled()
  })

  test("a switch change on a missing post is not found and writes nothing", async () => {
    mocks.lockExistingIds.mockResolvedValue([])

    await expect(
      channelPostManagementService.update({
        id: "1",
        settings: { hideComments: true },
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.updateSettings).not.toHaveBeenCalled()
  })

  test("an update with no switch values behaves like a plain existence check", async () => {
    await channelPostManagementService.update({
      id: "1",
      settings: {},
      workspaceId: "ws-1",
    })

    expect(mocks.lockExistingIds).not.toHaveBeenCalled()
    expect(mocks.updateSettings).not.toHaveBeenCalled()
  })

  test("an empty list clears every topic", async () => {
    await channelPostManagementService.update({
      id: "1",
      topicIds: [],
      workspaceId: "ws-1",
    })

    expect(mocks.replaceForPosts).toHaveBeenCalledWith(
      { channelPostIds: ["1"], topicIds: [] },
      tx,
    )
  })

  test("with no change only reads the post back, which answers not found when it is missing", async () => {
    mocks.findById.mockResolvedValue(row())

    await channelPostManagementService.update({ id: "1", workspaceId: "ws-1" })

    expect(mocks.replaceForPosts).not.toHaveBeenCalled()
    expect(mocks.findById).toHaveBeenCalledTimes(1)
  })

  test("is not found when the post is missing", async () => {
    mocks.lockExistingIds.mockResolvedValue([])

    await expect(
      channelPostManagementService.update({
        id: "1",
        topicIds: ["7"],
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.replaceForPosts).not.toHaveBeenCalled()
  })

  test("is not found when a topic belongs to another workspace", async () => {
    mocks.findExistingTopicIds.mockResolvedValue(["7"])

    await expect(
      channelPostManagementService.update({
        id: "1",
        topicIds: ["7", "99"],
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.replaceForPosts).not.toHaveBeenCalled()
  })

  test("rejects repeated topic ids", async () => {
    await expect(
      channelPostManagementService.update({
        id: "1",
        topicIds: ["7", "7"],
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation" })
  })

  test("rejects more topics than a post may carry before touching the database", async () => {
    const topicIds = Array.from(
      { length: MAX_TOPICS_PER_POST + 1 },
      (_, index) => String(index + 1),
    )

    await expect(
      channelPostManagementService.update({
        id: "1",
        topicIds,
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.lockExistingIds).not.toHaveBeenCalled()
  })

  test("turns a post or topic deleted mid-write into not found", async () => {
    mocks.isForeignKeyViolationError.mockReturnValueOnce(true)
    mocks.replaceForPosts.mockRejectedValue(new Error("fk"))

    await expect(
      channelPostManagementService.update({
        id: "1",
        topicIds: ["7"],
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})

describe("channelPostManagementService.bulkUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findChannels.mockResolvedValue(["messenger"])
    mocks.lockExistingIds.mockImplementation(
      async ({ ids }: { ids: string[] }) => ids,
    )
    mocks.findExistingTopicIds.mockImplementation(
      async ({ ids }: { ids: string[] }) => ids,
    )
    mocks.findPostsOverTopicLimit.mockResolvedValue([])
  })

  test("removes then adds topics for every post in one transaction", async () => {
    const result = await channelPostManagementService.bulkUpdate({
      addTopicIds: ["7"],
      ids: ["1", "2"],
      removeTopicIds: ["8"],
      workspaceId: "ws-1",
    })

    expect(result).toEqual({ updatedCount: 2 })
    expect(mocks.removeFromPosts).toHaveBeenCalledWith(
      { channelPostIds: ["1", "2"], topicIds: ["8"] },
      tx,
    )
    expect(mocks.addToPosts).toHaveBeenCalledWith(
      { channelPostIds: ["1", "2"], topicIds: ["7"] },
      tx,
    )
  })

  test("sets the switches on every listed post in the same transaction", async () => {
    const result = await channelPostManagementService.bulkUpdate({
      ids: ["1", "2"],
      settings: { skipComments: true },
      workspaceId: "ws-1",
    })

    expect(result).toEqual({ updatedCount: 2 })
    expect(mocks.updateSettings).toHaveBeenCalledWith(
      {
        ids: ["1", "2"],
        patch: { skipComments: true },
        workspaceId: "ws-1",
      },
      tx,
    )
  })

  test("a request that changes nothing is rejected", async () => {
    await expect(
      channelPostManagementService.bulkUpdate({
        ids: ["1"],
        settings: {},
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.lockExistingIds).not.toHaveBeenCalled()
  })

  test("rejects more posts than one request may touch", async () => {
    const ids = Array.from({ length: MAX_BULK_UPDATE_POSTS + 1 }, (_, i) =>
      String(i + 1),
    )

    await expect(
      channelPostManagementService.bulkUpdate({
        addTopicIds: ["7"],
        ids,
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.addToPosts).not.toHaveBeenCalled()
  })

  test("locks the posts before writing any topic row", async () => {
    const order: string[] = []
    mocks.lockExistingIds.mockImplementation(({ ids }: { ids: string[] }) => {
      order.push("lock")
      return Promise.resolve(ids)
    })
    mocks.addToPosts.mockImplementation(() => {
      order.push("write")
      return Promise.resolve()
    })

    await channelPostManagementService.bulkUpdate({
      addTopicIds: ["7"],
      ids: ["1", "2"],
      workspaceId: "ws-1",
    })

    expect(order).toEqual(["lock", "write"])
  })

  test("rejects a topic named in both add and remove", async () => {
    await expect(
      channelPostManagementService.bulkUpdate({
        addTopicIds: ["7"],
        ids: ["1"],
        removeTopicIds: ["7"],
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation", field: "removeTopicIds" })
    expect(mocks.addToPosts).not.toHaveBeenCalled()
  })

  test("reports a repeated id on the list that repeats it", async () => {
    await expect(
      channelPostManagementService.bulkUpdate({
        addTopicIds: ["7", "7"],
        ids: ["1"],
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation", field: "addTopicIds" })
  })

  test("rejects more than the per-post topic limit in add or remove", async () => {
    const many = Array.from({ length: MAX_TOPICS_PER_POST + 1 }, (_, i) =>
      String(i + 1),
    )

    await expect(
      channelPostManagementService.bulkUpdate({
        addTopicIds: many,
        ids: ["1"],
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation" })
    await expect(
      channelPostManagementService.bulkUpdate({
        ids: ["1"],
        removeTopicIds: many,
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.lockExistingIds).not.toHaveBeenCalled()
  })

  test("rejects repeated post ids", async () => {
    await expect(
      channelPostManagementService.bulkUpdate({
        addTopicIds: ["7"],
        ids: ["1", "1"],
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation" })
  })

  test("rejects a switch when any selected post lacks comment settings", async () => {
    mocks.findChannels.mockResolvedValue(["messenger", "tiktok"])

    await expect(
      channelPostManagementService.bulkUpdate({
        ids: ["1", "2"],
        settings: { skipComments: true },
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation", field: "settings" })
    expect(mocks.updateSettings).not.toHaveBeenCalled()
  })

  test("fails the whole request when any post is unknown", async () => {
    mocks.lockExistingIds.mockResolvedValue(["1"])

    await expect(
      channelPostManagementService.bulkUpdate({
        addTopicIds: ["7"],
        ids: ["1", "2"],
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.addToPosts).not.toHaveBeenCalled()
  })

  test("rolls back when an add would push a post over the topic limit", async () => {
    mocks.findPostsOverTopicLimit.mockResolvedValue(["2"])

    await expect(
      channelPostManagementService.bulkUpdate({
        addTopicIds: ["7"],
        ids: ["1", "2"],
        workspaceId: "ws-1",
      }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.findPostsOverTopicLimit).toHaveBeenCalledWith(
      { channelPostIds: ["1", "2"], limit: MAX_TOPICS_PER_POST },
      tx,
    )
  })
})

describe("channelPostManagementService.listAuthors", () => {
  test("passes the workspace and the narrowing through and wraps the rows", async () => {
    mocks.listAuthors.mockResolvedValue([
      {
        authorExternalId: "a1",
        authorKey: "10:a1",
        authorName: "Shop",
        channel: "messenger",
        inboxId: "10",
        inboxName: "Page",
        postsCount: 3,
      },
    ])

    const result = await channelPostManagementService.listAuthors({
      channels: ["messenger"],
      inboxIds: ["10"],
      workspaceId: "ws-1",
    })

    expect(mocks.listAuthors).toHaveBeenCalledWith({
      channels: ["messenger"],
      inboxIds: ["10"],
      workspaceId: "ws-1",
    })
    expect(result).toEqual({
      items: [
        {
          authorExternalId: "a1",
          authorKey: "10:a1",
          authorName: "Shop",
          channel: "messenger",
          inboxId: "10",
          inboxName: "Page",
          postsCount: 3,
        },
      ],
    })
  })
})
