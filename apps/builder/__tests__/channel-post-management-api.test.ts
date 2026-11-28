// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

type Handler = (args: unknown) => Promise<unknown>

type RouteConfig = { method: string; path: string; successStatus?: number }

type CapturedProcedure = {
  handler?: Handler
  route: RouteConfig
}

const { capturedProcedures, scopes, workspaceTokenAuthAPIForScope } =
  vi.hoisted(() => {
    const capturedProcedures: CapturedProcedure[] = []
    const scopes: string[] = []

    const makeProcedure = () => {
      let route: RouteConfig = { method: "", path: "" }
      const chain = {
        errors: vi.fn(() => chain),
        input: vi.fn(() => chain),
        output: vi.fn(() => chain),
        route: vi.fn((config: RouteConfig) => {
          route = config
          return chain
        }),
        use: vi.fn(() => chain),
        handler: vi.fn((handler: Handler) => {
          capturedProcedures.push({ handler, route })
          return { handler }
        }),
      }
      return chain
    }

    return {
      capturedProcedures,
      scopes,
      workspaceTokenAuthAPIForScope: vi.fn((scope: string) => {
        scopes.push(scope)
        return makeProcedure()
      }),
    }
  })

const list = vi.fn()
const get = vi.fn()
const update = vi.fn()
const bulkUpdate = vi.fn()
const startSync = vi.fn()
const syncStatus = vi.fn()
const refreshChannelPostNow = vi.fn()
const requestMetricsRefresh = vi.fn()
const shareCriteria = vi.fn()
const topicList = vi.fn()
const topicCreate = vi.fn()
const topicUpdate = vi.fn()
const topicDelete = vi.fn()
const listAuthors = vi.fn()
const listComments = vi.fn()
const mergeView = vi.fn()
const likeComment = vi.fn()
const deleteComment = vi.fn()
const exportBuild = vi.fn()
const startCommentExport = vi.fn()
const getCommentExportStatus = vi.fn()
const assertWorkspaceNotBlocked = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  MAX_BULK_UPDATE_POSTS: 100,
  MAX_EXPORT_POST_ROWS: 5000,
  MAX_EXPORT_ROWS: 20_000,
  MAX_MERGE_VIEW_POSTS: 20,
  MAX_TOPICS_PER_POST: 20,
  channelPostCommentsService: {
    delete: deleteComment,
    like: likeComment,
    list: listComments,
    mergeView,
  },
  POST_COMMENT_SENDERS: ["contact", "page"],
  channelPostCommentExportKinds: ["comments", "phones", "emails"],
  channelPostCommentExportService: {
    getStatus: getCommentExportStatus,
    start: startCommentExport,
  },
  channelPostExportKinds: ["comments", "phones", "emails", "rows"],
  channelPostExportService: { build: exportBuild },
  channelPostManagementService: { bulkUpdate, get, list, listAuthors, update },
  channelPostMetricsRefreshService: { requestMetricsRefresh },
  channelPostShareService: { shareCriteria },
  channelPostSyncService: {
    listStatus: syncStatus,
    request: startSync,
  },
  postTopicService: {
    create: topicCreate,
    delete: topicDelete,
    list: topicList,
    update: topicUpdate,
  },
}))
vi.mock("@chatbotx.io/channel-registry/channel-post-refresh", () => ({
  refreshChannelPostNow,
}))
vi.mock("@/lib/workspace-quota", () => ({ assertWorkspaceNotBlocked }))
vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

await import("@/features/channel-posts/api/management-public")
await import("@/features/post-topics/api/public")
const {
  bulkUpdateChannelPostManagementRequest,
  channelPostManagementCursor,
  channelPostCommentCursor,
  channelPostSyncInboxFilter,
  deleteChannelPostCommentRequest,
  exportChannelPostCommentsRequest,
  exportChannelPostRowsFilters,
  getChannelPostCommentExportRequest,
  likeChannelPostCommentRequest,
  listChannelPostAuthorsRequest,
  listChannelPostCommentsRequest,
  listChannelPostManagementRequest,
  mergeChannelPostCommentsRequest,
  refreshChannelPostMetricsRequest,
  startChannelPostCommentExportRequest,
  startChannelPostSyncRequest,
  updateChannelPostManagementRequest,
} = await import("@/features/channel-posts/schema/management")
const { createPostTopicRequest } = await import("@/features/post-topics/schema")

const procedure = (method: string, path: string): CapturedProcedure => {
  const found = capturedProcedures.find(
    (candidate) =>
      candidate.route.method === method && candidate.route.path === path,
  )
  if (!found?.handler) {
    throw new Error(`Missing ${method} ${path}`)
  }
  return found
}

const call = async (method: string, path: string, input: unknown) =>
  await procedure(method, path).handler?.({
    context: { workspace: { id: "ws-1", ownerId: "owner-1" } },
    input,
  })

beforeEach(() => {
  vi.clearAllMocks()
})

describe("posts public API surface", () => {
  test("every route is behind the posts scope", () => {
    expect(new Set(scopes)).toEqual(new Set(["posts"]))
    expect(capturedProcedures).toHaveLength(21)
  })

  test("paths and verbs", () => {
    const routes = capturedProcedures.map(
      ({ route }) => `${route.method} ${route.path}`,
    )

    expect(routes).toEqual([
      "GET /v1/channel-posts/management",
      // Static before the parameterised `/{id}` so `authors` is never read as an id.
      "GET /v1/channel-posts/management/authors",
      "GET /v1/channel-posts/management/{id}",
      "GET /v1/channel-posts/management/{id}/metrics",
      "PATCH /v1/channel-posts/management/{id}",
      "POST /v1/channel-posts/management/bulk-update",
      "POST /v1/channel-posts/sync",
      "GET /v1/channel-posts/sync/status",
      "POST /v1/channel-posts/management/{id}/refresh",
      "POST /v1/channel-posts/management/refresh-metrics",
      "GET /v1/channel-posts/management/{id}/comments",
      "POST /v1/channel-posts/management/merge-view",
      "POST /v1/channel-posts/management/{id}/comments/{commentId}/like",
      "DELETE /v1/channel-posts/management/{id}/comments/{commentId}",
      "POST /v1/channel-posts/management/export",
      "POST /v1/channel-posts/management/exports",
      "GET /v1/channel-posts/management/exports/{fileId}",
      "GET /v1/post-topics",
      "POST /v1/post-topics",
      "PATCH /v1/post-topics/{id}",
      "DELETE /v1/post-topics/{id}",
    ])
  })

  test("deleting a topic answers 204 with no body", () => {
    expect(
      procedure("DELETE", "/v1/post-topics/{id}").route.successStatus,
    ).toBe(204)
  })

  test("does not shadow the existing channel post procedures", () => {
    const paths = capturedProcedures.map(({ route }) => route.path)

    expect(paths).not.toContain("/v1/channel-posts")
    expect(paths).not.toContain("/v1/channel-posts/options/by-ids")
  })
})

describe("GET /v1/channel-posts/management", () => {
  test("lists only posts with comments by default and scopes to the token's workspace", async () => {
    list.mockResolvedValue({ items: [] })

    await call("GET", "/v1/channel-posts/management", {
      limit: 30,
      sort: "newest",
    })

    expect(list).toHaveBeenCalledWith({
      cursor: undefined,
      filters: { hasComments: true },
      limit: 30,
      sort: "newest",
      workspaceId: "ws-1",
    })
  })

  test("shareableOnly lists what a channel can send: the channels' rules as filters, and posts without comments too", async () => {
    list.mockResolvedValue({ items: [] })
    const criteria = [
      {
        channel: "instagram",
        contentTypes: ["photo"],
        requirePermalink: false,
      },
    ]
    shareCriteria.mockReturnValue(criteria)

    await call("GET", "/v1/channel-posts/management", {
      inboxIds: ["7"],
      limit: 30,
      shareableOnly: true,
      sort: "newest",
    })

    expect(list).toHaveBeenCalledWith({
      cursor: undefined,
      filters: { hasComments: false, inboxIds: ["7"], shareable: criteria },
      limit: 30,
      sort: "newest",
      workspaceId: "ws-1",
    })
  })

  test("shareableOnly keeps an explicit hasComments, and false adds no filter", async () => {
    list.mockResolvedValue({ items: [] })
    shareCriteria.mockReturnValue([])

    await call("GET", "/v1/channel-posts/management", {
      hasComments: true,
      limit: 30,
      shareableOnly: true,
      sort: "newest",
    })
    await call("GET", "/v1/channel-posts/management", {
      limit: 30,
      shareableOnly: false,
      sort: "newest",
    })

    expect(list.mock.calls[0]?.[0].filters).toEqual({
      hasComments: true,
      shareable: [],
    })
    expect(list.mock.calls[1]?.[0].filters).toEqual({ hasComments: true })
  })

  test("passes the filters through and honours hasComments=false", async () => {
    list.mockResolvedValue({ items: [] })

    await call("GET", "/v1/channel-posts/management", {
      channels: ["messenger"],
      cursor: { id: "1", sort: "mostComments", sortValue: "5" },
      hasComments: false,
      inboxIds: ["7"],
      limit: 10,
      sort: "mostComments",
      topicIds: ["3"],
    })

    expect(list).toHaveBeenCalledWith({
      cursor: { id: "1", sort: "mostComments", sortValue: "5" },
      filters: {
        channels: ["messenger"],
        hasComments: false,
        inboxIds: ["7"],
        topicIds: ["3"],
      },
      limit: 10,
      sort: "mostComments",
      workspaceId: "ws-1",
    })
  })
})

describe("management request schemas", () => {
  test("wraps a lone query value and accepts repeated ones", () => {
    const lone = listChannelPostManagementRequest.parse({
      channels: "messenger",
    })
    const repeated = listChannelPostManagementRequest.parse({
      channels: ["messenger", "instagram"],
    })

    expect(lone.channels).toEqual(["messenger"])
    expect(repeated.channels).toEqual(["messenger", "instagram"])
  })

  test("applies the defaults", () => {
    const parsed = listChannelPostManagementRequest.parse({})

    expect(parsed.limit).toBe(30)
    expect(parsed.sort).toBe("newest")
    expect(parsed.hasComments).toBeUndefined()
  })

  test("shareableOnly accepts only the literals true and false, and is not an export filter", () => {
    expect(
      listChannelPostManagementRequest.parse({ shareableOnly: "true" })
        .shareableOnly,
    ).toBe(true)
    expect(
      listChannelPostManagementRequest.safeParse({ shareableOnly: "1" })
        .success,
    ).toBe(false)
    expect(exportChannelPostRowsFilters.shape).not.toHaveProperty(
      "shareableOnly",
    )
  })

  test("hasComments accepts only the literals true and false", () => {
    expect(
      listChannelPostManagementRequest.parse({ hasComments: "false" })
        .hasComments,
    ).toBe(false)
    expect(
      listChannelPostManagementRequest.safeParse({ hasComments: "0" }).success,
    ).toBe(false)
  })

  test("rejects an unknown sort, channel and out-of-range limit", () => {
    expect(
      listChannelPostManagementRequest.safeParse({ sort: "random" }).success,
    ).toBe(false)
    expect(
      listChannelPostManagementRequest.safeParse({ channels: "fax" }).success,
    ).toBe(false)
    expect(
      listChannelPostManagementRequest.safeParse({ limit: 101 }).success,
    ).toBe(false)
  })

  test("rejects non-numeric inbox and topic ids", () => {
    expect(
      listChannelPostManagementRequest.safeParse({ inboxIds: ["x"] }).success,
    ).toBe(false)
    expect(
      listChannelPostManagementRequest.safeParse({ topicIds: ["1; --"] })
        .success,
    ).toBe(false)
  })

  test("the cursor needs a numeric id, a known sort and a bounded sort value", () => {
    const valid = { id: "1", sort: "mostComments", sortValue: "5" }

    expect(channelPostManagementCursor.safeParse(valid).success).toBe(true)
    expect(
      channelPostManagementCursor.safeParse({ ...valid, id: "x" }).success,
    ).toBe(false)
    expect(
      channelPostManagementCursor.safeParse({ ...valid, sort: "random" })
        .success,
    ).toBe(false)
    expect(
      channelPostManagementCursor.safeParse({
        ...valid,
        sortValue: "x".repeat(65),
      }).success,
    ).toBe(false)
  })

  test("bulk update needs 1-100 post ids and at most 20 topics per list", () => {
    const ids = (count: number) =>
      Array.from({ length: count }, (_, index) => String(index + 1))

    expect(
      bulkUpdateChannelPostManagementRequest.safeParse({ ids: [] }).success,
    ).toBe(false)
    expect(
      bulkUpdateChannelPostManagementRequest.safeParse({ ids: ids(101) })
        .success,
    ).toBe(false)
    expect(
      bulkUpdateChannelPostManagementRequest.safeParse({
        addTopicIds: ids(21),
        ids: ids(2),
      }).success,
    ).toBe(false)
    expect(
      bulkUpdateChannelPostManagementRequest.safeParse({ ids: ids(100) })
        .success,
    ).toBe(true)
  })

  test("a post update may clear all topics with an empty list", () => {
    expect(
      updateChannelPostManagementRequest.parse({ id: "1", topicIds: [] })
        .topicIds,
    ).toEqual([])
  })

  test("a topic color must be a hex value", () => {
    expect(
      createPostTopicRequest.safeParse({ color: "red", name: "Sale" }).success,
    ).toBe(false)
    expect(
      createPostTopicRequest.safeParse({ color: "#1a73e8", name: "Sale" })
        .success,
    ).toBe(true)
    expect(createPostTopicRequest.safeParse({ name: "  " }).success).toBe(false)
  })
})

describe("management comment switches", () => {
  test("a post update passes the switches to the service", async () => {
    update.mockResolvedValue({ id: "1" })

    await call("PATCH", "/v1/channel-posts/management/{id}", {
      hideComments: true,
      hidePhoneComments: false,
      id: "1",
      skipComments: true,
    })

    expect(update).toHaveBeenCalledWith({
      id: "1",
      settings: {
        hideComments: true,
        hidePhoneComments: false,
        skipComments: true,
      },
      topicIds: undefined,
      workspaceId: "ws-1",
    })
  })

  test("a bulk update passes the switches to the service", async () => {
    bulkUpdate.mockResolvedValue({ updatedCount: 1 })

    await call("POST", "/v1/channel-posts/management/bulk-update", {
      hideComments: true,
      ids: ["1"],
    })

    expect(bulkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        ids: ["1"],
        settings: expect.objectContaining({ hideComments: true }),
      }),
    )
  })

  test("the list filters accept the switches as true or false", () => {
    const parsed = listChannelPostManagementRequest.parse({
      hideComments: "true",
      hidePhoneComments: "false",
      skipComments: "true",
    })

    expect(parsed.hideComments).toBe(true)
    expect(parsed.hidePhoneComments).toBe(false)
    expect(parsed.skipComments).toBe(true)
    expect(
      listChannelPostManagementRequest.safeParse({ skipComments: "yes" })
        .success,
    ).toBe(false)
  })

  test("the list passes a switch filter through to the service", async () => {
    list.mockResolvedValue({ items: [] })

    await call("GET", "/v1/channel-posts/management", {
      hideComments: true,
      limit: 30,
      sort: "newest",
    })

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { hasComments: true, hideComments: true },
      }),
    )
  })
})

describe("post sync procedures", () => {
  test("start sync passes the inboxes and the token's workspace", async () => {
    startSync.mockResolvedValue({ items: [] })

    await call("POST", "/v1/channel-posts/sync", { inboxIds: ["3", "4"] })
    await call("POST", "/v1/channel-posts/sync", {})

    expect(startSync).toHaveBeenNthCalledWith(1, {
      inboxIds: ["3", "4"],
      workspaceId: "ws-1",
    })
    expect(startSync).toHaveBeenNthCalledWith(2, {
      inboxIds: undefined,
      workspaceId: "ws-1",
    })
  })

  test("sync status is scoped to the token's workspace", async () => {
    syncStatus.mockResolvedValue({ items: [] })

    await call("GET", "/v1/channel-posts/sync/status", { inboxIds: ["3"] })

    expect(syncStatus).toHaveBeenCalledWith({
      inboxIds: ["3"],
      workspaceId: "ws-1",
    })
  })

  test("refresh reads the post now in the token's workspace and returns it", async () => {
    get.mockResolvedValue({ id: "9", commentsCount: 8 })
    refreshChannelPostNow.mockResolvedValue("refreshed")

    const result = await call(
      "POST",
      "/v1/channel-posts/management/{id}/refresh",
      { id: "9" },
    )

    expect(refreshChannelPostNow).toHaveBeenCalledWith({
      channelPostId: "9",
      workspaceId: "ws-1",
    })
    expect(result).toEqual({
      outcome: "refreshed",
      post: { id: "9", commentsCount: 8 },
      queued: true,
    })
  })

  test("refresh of an unknown post fails before anything is read", async () => {
    get.mockRejectedValue(new Error("Post not found."))

    await expect(
      call("POST", "/v1/channel-posts/management/{id}/refresh", { id: "9" }),
    ).rejects.toThrow("Post not found.")
    expect(refreshChannelPostNow).not.toHaveBeenCalled()
  })

  test("a post the channel says is gone comes back as removed with no post", async () => {
    get.mockResolvedValue({ id: "9" })
    refreshChannelPostNow.mockResolvedValue("removed")

    const result = await call(
      "POST",
      "/v1/channel-posts/management/{id}/refresh",
      { id: "9" },
    )

    expect(result).toEqual({ outcome: "removed", post: null, queued: true })
    expect(get).toHaveBeenCalledTimes(1)
  })

  test.each([
    "cooldown",
    "rateLimited",
    "channelUnavailable",
  ])("refresh answers the %s outcome with the post as stored", async (outcome) => {
    get.mockResolvedValue({ id: "9" })
    refreshChannelPostNow.mockResolvedValue(outcome)

    const result = await call(
      "POST",
      "/v1/channel-posts/management/{id}/refresh",
      { id: "9" },
    )

    expect(result).toEqual({ outcome, post: { id: "9" }, queued: true })
  })

  test("refresh-metrics asks fresh counts in the token's workspace", async () => {
    requestMetricsRefresh.mockResolvedValue({ fresh: 0, queued: 2, skipped: 1 })

    const result = await call(
      "POST",
      "/v1/channel-posts/management/refresh-metrics",
      { ids: ["1", "2", "3"] },
    )

    expect(requestMetricsRefresh).toHaveBeenCalledWith({
      channelPostIds: ["1", "2", "3"],
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ fresh: 0, queued: 2, skipped: 1 })
  })

  test("refresh-metrics takes 1 to 50 numeric ids", () => {
    const ok = (ids: unknown) =>
      refreshChannelPostMetricsRequest.safeParse({ ids }).success

    expect(ok([])).toBe(false)
    expect(ok(["x"])).toBe(false)
    expect(ok(Array.from({ length: 51 }, (_, i) => String(i + 1)))).toBe(false)
    expect(ok(Array.from({ length: 50 }, (_, i) => String(i + 1)))).toBe(true)
  })

  test("the sync request caps the inbox list and rejects non-numeric ids", () => {
    expect(
      startChannelPostSyncRequest.safeParse({ inboxIds: ["x"] }).success,
    ).toBe(false)
    expect(
      startChannelPostSyncRequest.safeParse({
        inboxIds: Array.from({ length: 201 }, (_, i) => String(i + 1)),
      }).success,
    ).toBe(false)
    expect(startChannelPostSyncRequest.safeParse({}).success).toBe(true)
  })

  test("the status filter wraps a single query value", () => {
    expect(
      channelPostSyncInboxFilter.parse({ inboxIds: "3" }).inboxIds,
    ).toEqual(["3"])
  })
})

describe("management write procedures", () => {
  test("update sends only the topic change for the path's post", async () => {
    update.mockResolvedValue({ id: "1" })

    await call("PATCH", "/v1/channel-posts/management/{id}", {
      id: "1",
      topicIds: ["7"],
    })

    expect(update).toHaveBeenCalledWith({
      id: "1",
      settings: {
        hideComments: undefined,
        hidePhoneComments: undefined,
        skipComments: undefined,
      },
      topicIds: ["7"],
      workspaceId: "ws-1",
    })
  })

  test("bulk update is scoped to the token's workspace", async () => {
    bulkUpdate.mockResolvedValue({ updatedCount: 2 })

    await call("POST", "/v1/channel-posts/management/bulk-update", {
      addTopicIds: ["7"],
      ids: ["1", "2"],
    })

    expect(bulkUpdate).toHaveBeenCalledWith({
      addTopicIds: ["7"],
      ids: ["1", "2"],
      removeTopicIds: undefined,
      settings: {
        hideComments: undefined,
        hidePhoneComments: undefined,
        skipComments: undefined,
      },
      workspaceId: "ws-1",
    })
  })

  test("topic procedures use the token's workspace", async () => {
    topicList.mockResolvedValue({ items: [] })
    topicCreate.mockResolvedValue({ id: "1" })
    topicUpdate.mockResolvedValue({ id: "1" })

    await call("GET", "/v1/post-topics", { search: "sa" })
    await call("POST", "/v1/post-topics", { name: "Sale" })
    await call("PATCH", "/v1/post-topics/{id}", { id: "1", name: "New" })
    await call("DELETE", "/v1/post-topics/{id}", { id: "1" })

    expect(topicList).toHaveBeenCalledWith({
      search: "sa",
      workspaceId: "ws-1",
    })
    expect(topicCreate).toHaveBeenCalledWith({
      name: "Sale",
      workspaceId: "ws-1",
    })
    expect(topicUpdate).toHaveBeenCalledWith({
      id: "1",
      name: "New",
      workspaceId: "ws-1",
    })
    expect(topicDelete).toHaveBeenCalledWith({ id: "1", workspaceId: "ws-1" })
  })
})

describe("author filter and author list", () => {
  test("the list passes authorIds through to the service filters", async () => {
    list.mockResolvedValue({ items: [] })

    await call("GET", "/v1/channel-posts/management", {
      authorIds: ["a1", "a2"],
      limit: 30,
      sort: "newest",
    })

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { authorIds: ["a1", "a2"], hasComments: true },
      }),
    )
  })

  test("authorIds wraps a single query value and is capped", () => {
    expect(
      listChannelPostManagementRequest.parse({ authorIds: "a1" }).authorIds,
    ).toEqual(["a1"])
    expect(
      listChannelPostManagementRequest.safeParse({
        authorIds: Array.from({ length: 201 }, (_, index) => `a${index}`),
      }).success,
    ).toBe(false)
    expect(
      listChannelPostManagementRequest.safeParse({ authorIds: [""] }).success,
    ).toBe(false)
  })

  test("listing authors is scoped to the token's workspace with the narrowing", async () => {
    listAuthors.mockResolvedValue({ items: [] })

    await call("GET", "/v1/channel-posts/management/authors", {
      channels: ["messenger"],
      inboxIds: ["3"],
    })

    expect(listAuthors).toHaveBeenCalledWith({
      channels: ["messenger"],
      inboxIds: ["3"],
      workspaceId: "ws-1",
    })
    expect(listChannelPostAuthorsRequest.parse({ channels: "tiktok" })).toEqual(
      { channels: ["tiktok"] },
    )
  })
})

describe("post comment procedures", () => {
  const cursor = {
    createdAt: "2026-11-22 10:00:00.123456+00",
    id: "77",
    shardId: "shard-a",
  }

  test("listing reads one post's comments as a token caller who may view phone numbers", async () => {
    listComments.mockResolvedValue({ items: [] })

    await call("GET", "/v1/channel-posts/management/{id}/comments", {
      cursor,
      hasPhone: true,
      id: "9",
      limit: 30,
      search: "call",
    })

    expect(listComments).toHaveBeenCalledWith({
      canViewEmailAndPhone: true,
      cursor,
      hasPhone: true,
      limit: 30,
      postId: "9",
      search: "call",
      workspaceId: "ws-1",
    })
  })

  test("the list request takes string booleans, a bounded page and a valid cursor", () => {
    expect(
      listChannelPostCommentsRequest.parse({ hasPhone: "true", id: "9" }),
    ).toMatchObject({ hasPhone: true, limit: 30 })
    expect(
      listChannelPostCommentsRequest.safeParse({ id: "9", limit: 101 }).success,
    ).toBe(false)
    expect(
      listChannelPostCommentsRequest.safeParse({ id: "x", limit: 5 }).success,
    ).toBe(false)
    expect(channelPostCommentCursor.safeParse(cursor).success).toBe(true)
    expect(
      channelPostCommentCursor.safeParse({ ...cursor, createdAt: "yesterday" })
        .success,
    ).toBe(false)
  })

  test("merge-view reads the posts with a real boolean filter and caps the post list", async () => {
    mergeView.mockResolvedValue({ items: [] })

    await call("POST", "/v1/channel-posts/management/merge-view", {
      hasPhone: false,
      limit: 10,
      postIds: ["1", "2"],
    })

    expect(mergeView).toHaveBeenCalledWith({
      canViewEmailAndPhone: true,
      cursor: undefined,
      hasPhone: false,
      limit: 10,
      postIds: ["1", "2"],
      search: undefined,
      workspaceId: "ws-1",
    })
    expect(
      mergeChannelPostCommentsRequest.safeParse({ postIds: [] }).success,
    ).toBe(false)
    expect(
      mergeChannelPostCommentsRequest.safeParse({
        postIds: Array.from({ length: 21 }, (_, index) => String(index + 1)),
      }).success,
    ).toBe(false)
  })

  test("like sends the comment, its createdAt and the state for the path's post", async () => {
    likeComment.mockResolvedValue({ liked: true })
    const createdAt = new Date("2026-11-22T10:00:00.123Z")

    const result = await call(
      "POST",
      "/v1/channel-posts/management/{id}/comments/{commentId}/like",
      { commentId: "5", createdAt, id: "9", liked: true },
    )

    expect(likeComment).toHaveBeenCalledWith({
      commentId: "5",
      createdAt,
      liked: true,
      postId: "9",
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ liked: true })
    expect(
      likeChannelPostCommentRequest.safeParse({
        commentId: "5",
        createdAt: "2026-11-22T10:00:00.123Z",
        id: "9",
      }).success,
    ).toBe(false)
  })

  test("delete is scoped to the token's workspace and needs createdAt", async () => {
    deleteComment.mockResolvedValue({ deletedMessageIds: ["5"] })
    const createdAt = new Date("2026-11-22T10:00:00.123Z")

    await call(
      "DELETE",
      "/v1/channel-posts/management/{id}/comments/{commentId}",
      { commentId: "5", createdAt, id: "9" },
    )

    expect(deleteComment).toHaveBeenCalledWith({
      commentId: "5",
      createdAt,
      postId: "9",
      workspaceId: "ws-1",
    })
    expect(
      deleteChannelPostCommentRequest.safeParse({ commentId: "5", id: "9" })
        .success,
    ).toBe(false)
  })
})

describe("POST /v1/channel-posts/management/export", () => {
  test("builds the file for the token's workspace", async () => {
    exportBuild.mockResolvedValue({
      csv: "customer\n",
      fileName: "post-phones-2026-11-23.csv",
      rowCount: 0,
      truncated: false,
    })

    const result = await call("POST", "/v1/channel-posts/management/export", {
      kind: "phones",
      postIds: ["1", "2"],
      search: "call",
    })

    expect(exportBuild).toHaveBeenCalledWith({
      canViewEmailAndPhone: true,
      // Omitted filters stay omitted: the comment kinds refuse any filters.
      filters: undefined,
      kind: "phones",
      postIds: ["1", "2"],
      search: "call",
      sort: undefined,
      workspaceId: "ws-1",
    })
    expect(result).toMatchObject({ rowCount: 0, truncated: false })
  })

  test("a posts-list export passes the list filters and sort to the service", async () => {
    exportBuild.mockResolvedValue({
      csv: "",
      fileName: "post-rows-2026-11-24.csv",
      rowCount: 0,
      truncated: false,
    })

    await call("POST", "/v1/channel-posts/management/export", {
      filters: { channels: ["messenger"], sort: "mostComments" },
      kind: "rows",
    })

    expect(exportBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { channels: ["messenger"] },
        kind: "rows",
        sort: "mostComments",
      }),
    )
  })

  test("accepts the three comment kinds and 1-20 posts", () => {
    expect(
      exportChannelPostCommentsRequest.safeParse({
        kind: "comments",
        postIds: ["1"],
      }).success,
    ).toBe(true)
    expect(
      exportChannelPostCommentsRequest.safeParse({
        kind: "emails",
        postIds: ["1"],
      }).success,
    ).toBe(true)
    expect(
      exportChannelPostCommentsRequest.safeParse({
        kind: "comments",
        postIds: [],
      }).success,
    ).toBe(false)
  })
})

describe("POST /v1/channel-posts/management/exports", () => {
  const start = async (input: unknown) =>
    await call("POST", "/v1/channel-posts/management/exports", input)

  test("answers 202 and is declared as such", () => {
    expect(
      procedure("POST", "/v1/channel-posts/management/exports").route
        .successStatus,
    ).toBe(202)
  })

  test("starts the export for the token's workspace as a caller with full contact data and no session user", async () => {
    startCommentExport.mockResolvedValue({ fileId: "9", status: "pending" })

    const result = await start({ kind: "emails", postIds: ["1", "2"] })

    expect(assertWorkspaceNotBlocked).toHaveBeenCalledWith("owner-1")
    expect(startCommentExport).toHaveBeenCalledWith({
      canViewEmailAndPhone: true,
      kind: "emails",
      postIds: ["1", "2"],
      userId: null,
      workspaceId: "ws-1",
    })
    expect(result).toEqual({ fileId: "9", status: "pending" })
  })

  test("returns the running export's id when the same posts are already being read", async () => {
    startCommentExport.mockResolvedValue({ fileId: "7", status: "pending" })

    expect(await start({ kind: "comments", postIds: ["1"] })).toEqual({
      fileId: "7",
      status: "pending",
    })
  })

  test("a blocked workspace is refused before anything is validated or queued", async () => {
    assertWorkspaceNotBlocked.mockRejectedValueOnce(new Error("blocked"))

    await expect(start({ kind: "comments", postIds: ["1"] })).rejects.toThrow(
      "blocked",
    )
    expect(startCommentExport).not.toHaveBeenCalled()
  })

  test("a refusal of the service (permission, unsupported channel, quota) reaches the caller", async () => {
    startCommentExport.mockRejectedValueOnce(new Error("forbidden"))

    await expect(start({ kind: "phones", postIds: ["1"] })).rejects.toThrow(
      "forbidden",
    )
  })

  test("accepts the three comment kinds, never rows, and 1-20 posts", () => {
    const parse = (input: unknown) =>
      startChannelPostCommentExportRequest.safeParse(input).success

    for (const kind of ["comments", "phones", "emails"]) {
      expect(parse({ kind, postIds: ["1"] })).toBe(true)
    }
    expect(parse({ kind: "rows", postIds: ["1"] })).toBe(false)
    expect(parse({ kind: "comments", postIds: [] })).toBe(false)
    expect(
      parse({
        kind: "comments",
        postIds: Array.from({ length: 21 }, (_, index) => String(index + 1)),
      }),
    ).toBe(false)
    expect(parse({ kind: "comments" })).toBe(false)
  })
})

describe("GET /v1/channel-posts/management/exports/{fileId}", () => {
  const status = async (fileId: string) =>
    await call("GET", "/v1/channel-posts/management/exports/{fileId}", {
      fileId,
    })

  test("reads the status in the token's workspace as a caller with full contact data", async () => {
    const settled = {
      downloadUrl: "https://files.example/x.csv",
      expectedRows: null,
      failureReason: null,
      fileId: "9",
      kind: "comments",
      rowCount: 3,
      status: "uploaded",
      truncated: false,
    }
    getCommentExportStatus.mockResolvedValue(settled)

    expect(await status("9")).toEqual(settled)
    expect(getCommentExportStatus).toHaveBeenCalledWith({
      canViewEmailAndPhone: true,
      fileId: "9",
      workspaceId: "ws-1",
    })
    expect(assertWorkspaceNotBlocked).not.toHaveBeenCalled()
  })

  test("an unknown file, or another workspace's, is the service's not-found error", async () => {
    getCommentExportStatus.mockRejectedValueOnce(new Error("not found"))

    await expect(status("404")).rejects.toThrow("not found")
  })

  test("the file id must be a numeric string", () => {
    expect(
      getChannelPostCommentExportRequest.safeParse({ fileId: "123" }).success,
    ).toBe(true)
    expect(
      getChannelPostCommentExportRequest.safeParse({ fileId: "abc" }).success,
    ).toBe(false)
    // An id longer than a bigint is a 422, not a 500 from the database.
    expect(
      getChannelPostCommentExportRequest.safeParse({
        fileId: "9".repeat(40),
      }).success,
    ).toBe(false)
  })
})
