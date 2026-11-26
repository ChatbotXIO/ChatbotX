import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  chatQueueAdd: vi.fn(),
  deleteMessage: vi.fn(),
  findByIds: vi.fn(),
  countComments: vi.fn(),
  findCommenters: vi.fn(),
  findContactInboxes: vi.fn(),
  findContactInbox: vi.fn(),
  findConversation: vi.fn(),
  findMessage: vi.fn(),
  findThreads: vi.fn(),
  listComments: vi.fn(),
  queueRealtime: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  // Small, so a handful of threads reaches the cap.
  MAX_COMMENT_THREADS_PER_READ: 3,
  channelPostRepository: { findByIds: mocks.findByIds },
  createMessageRepository: () =>
    Promise.resolve({
      countComments: mocks.countComments,
      listComments: mocks.listComments,
    }),
  postCommentRepository: {
    findCommenters: mocks.findCommenters,
    findContactInboxes: mocks.findContactInboxes,
    findThreads: mocks.findThreads,
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  ChatJobAction: {
    changeChannelMessageState: "changeChannelMessageState",
    deleteChannelMessage: "deleteChannelMessage",
  },
  chatQueue: { add: mocks.chatQueueAdd },
}))
vi.mock("@chatbotx.io/realtime-protocol", () => ({
  RealtimeEventType: { messageDeleted: "messageDeleted" },
  routeForConversation: (conversation: { id: string }) => ({
    conversation: conversation.id,
  }),
}))
vi.mock("../src/message/service", () => ({
  messageService: {
    delete: mocks.deleteMessage,
    findWithAttachments: mocks.findMessage,
  },
}))
vi.mock("../src/conversation/service", () => ({
  conversationService: { findByOrFail: mocks.findConversation },
}))
vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { findByIdForWorkspace: mocks.findContactInbox },
}))
vi.mock("../src/platform/realtime-broadcast", () => ({
  queueWorkspaceRealtimeEvent: mocks.queueRealtime,
}))

const {
  channelPostCommentsService,
  COMMENT_ACTION_UNSUPPORTED_CODE,
  MAX_COMMENTS_PAGE_SIZE,
  MAX_MERGE_VIEW_POSTS,
} = await import("../src/channel-post/comments.service")

const post = (
  id: string,
  externalPostId: string,
  channel = "messenger",
  inboxId = "inbox-1",
) => ({
  caption: null,
  channel,
  externalPostId,
  id,
  inboxId,
})

const comment = (overrides: Record<string, unknown> = {}) => ({
  attributes: null,
  contactInboxId: "ci-1",
  conversationId: "conv-1",
  createdAt: new Date("2026-11-22T10:00:00.123Z"),
  createdAtText: "2026-11-22 10:00:00.123456+00",
  id: "m1",
  parentId: null,
  sourceId: "fb-comment-1",
  text: "Call me 0901 234 567",
  ...overrides,
})

const base = {
  canViewEmailAndPhone: true,
  limit: 30,
  workspaceId: "ws-1",
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findByIds.mockResolvedValue([post("p1", "ext-1")])
  mocks.findThreads.mockResolvedValue([
    {
      contactId: "k1",
      id: "conv-1",
      postExternalId: "ext-1",
    },
  ])
  // Every commenter reaches inbox-1 through contact inbox `ci-<n>`.
  mocks.findContactInboxes.mockResolvedValue([
    { contactId: "k1", id: "ci-1", inboxId: "inbox-1" },
    { contactId: "k2", id: "ci-2", inboxId: "inbox-1" },
  ])
  mocks.listComments.mockResolvedValue({ data: [comment()], nextCursor: null })
  mocks.findCommenters.mockResolvedValue([
    {
      avatar: "a.png",
      id: "k1",
      name: "An",
      phoneNumber: "0901234567",
      tags: [{ id: "t1", name: "VIP" }],
    },
  ])
})

describe("channelPostCommentsService.list", () => {
  test("returns the comments with their commenter, hidden and liked flags", async () => {
    mocks.listComments.mockResolvedValue({
      data: [comment({ attributes: { hidden: true, liked: true } })],
      nextCursor: null,
    })

    const page = await channelPostCommentsService.list({
      ...base,
      postId: "p1",
    })

    expect(page.items).toEqual([
      {
        author: {
          avatar: "a.png",
          id: "k1",
          name: "An",
          phoneNumber: "0901234567",
          tags: [{ id: "t1", name: "VIP" }],
        },
        commentId: "fb-comment-1",
        createdAt: new Date("2026-11-22T10:00:00.123Z"),
        hidden: true,
        id: "m1",
        liked: true,
        parentCommentId: null,
        postId: "p1",
        text: "Call me 0901 234 567",
      },
    ])
    expect(page.nextCursor).toBeUndefined()
  })

  test("reads the threads of the post's external id and the message page in the workspace", async () => {
    await channelPostCommentsService.list({
      ...base,
      hasPhone: true,
      postId: "p1",
      search: "call",
    })

    expect(mocks.findThreads).toHaveBeenCalledWith({
      posts: [{ externalPostId: "ext-1", inboxId: "inbox-1" }],
      workspaceId: "ws-1",
    })
    expect(mocks.listComments).toHaveBeenCalledWith({
      filter: {
        contactInboxIds: ["ci-1", "ci-2"],
        conversationIds: ["conv-1"],
        hasPhone: true,
        redactPhones: false,
        search: "call",
      },
      pagination: { cursor: undefined, limit: 30 },
      workspaceId: "ws-1",
    })
  })

  test("looks the commenters up once for the page, not per comment", async () => {
    mocks.listComments.mockResolvedValue({
      data: [
        comment({ id: "m1" }),
        comment({ id: "m2" }),
        comment({ id: "m3" }),
      ],
      nextCursor: null,
    })

    await channelPostCommentsService.list({ ...base, postId: "p1" })

    expect(mocks.findCommenters).toHaveBeenCalledTimes(1)
  })

  test("an unknown post is not found and reads no comments", async () => {
    mocks.findByIds.mockResolvedValue([])

    await expect(
      channelPostCommentsService.list({ ...base, postId: "missing" }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.listComments).not.toHaveBeenCalled()
  })

  test("a post nobody commented on answers an empty page without reading messages", async () => {
    mocks.findThreads.mockResolvedValue([])

    const page = await channelPostCommentsService.list({
      ...base,
      postId: "p1",
    })

    expect(page).toEqual({ items: [] })
    expect(mocks.listComments).not.toHaveBeenCalled()
  })

  test("clamps the page size", async () => {
    await channelPostCommentsService.list({
      ...base,
      limit: 5000,
      postId: "p1",
    })
    expect(mocks.listComments.mock.calls[0][0].pagination.limit).toBe(
      MAX_COMMENTS_PAGE_SIZE,
    )

    await channelPostCommentsService.list({ ...base, limit: 0, postId: "p1" })
    expect(mocks.listComments.mock.calls[1][0].pagination.limit).toBe(1)
  })

  test("hands the next page's cursor back as exact timestamp text and reads it as a cursor", async () => {
    mocks.listComments.mockResolvedValue({
      data: [comment()],
      nextCursor: {
        createdAt: new Date("2026-11-22T10:00:00.123Z"),
        createdAtText: "2026-11-22 10:00:00.123456+00",
        id: "m1",
        shardId: "shard-a",
      },
    })

    const page = await channelPostCommentsService.list({
      ...base,
      postId: "p1",
    })
    expect(page.nextCursor).toEqual({
      createdAt: "2026-11-22 10:00:00.123456+00",
      id: "m1",
      shardId: "shard-a",
    })

    await channelPostCommentsService.list({
      ...base,
      cursor: page.nextCursor,
      postId: "p1",
    })
    expect(mocks.listComments.mock.calls[1][0].pagination.cursor).toMatchObject(
      {
        createdAtText: "2026-11-22 10:00:00.123456+00",
        id: "m1",
        shardId: "shard-a",
      },
    )
  })

  test("a comment whose contact was deleted still lists, without an author", async () => {
    mocks.findCommenters.mockResolvedValue([])

    const page = await channelPostCommentsService.list({
      ...base,
      postId: "p1",
    })

    expect(page.items[0]?.author).toBeNull()
  })

  test("a comment in no known thread is dropped instead of misattributed", async () => {
    mocks.listComments.mockResolvedValue({
      data: [comment({ conversationId: "other" })],
      nextCursor: null,
    })

    const page = await channelPostCommentsService.list({
      ...base,
      postId: "p1",
    })

    expect(page.items).toEqual([])
  })
})

describe("phone data without the permission", () => {
  test("masks the commenter's phone and any number in the text", async () => {
    const page = await channelPostCommentsService.list({
      ...base,
      canViewEmailAndPhone: false,
      postId: "p1",
    })

    expect(page.items[0]?.author?.phoneNumber).toBeNull()
    expect(page.items[0]?.text).toBe("Call me •••")
  })

  test("refuses the phone filter, which would reveal which comments carry one", async () => {
    await expect(
      channelPostCommentsService.list({
        ...base,
        canViewEmailAndPhone: false,
        hasPhone: true,
        postId: "p1",
      }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.listComments).not.toHaveBeenCalled()
  })
})

describe("channelPostCommentsService.mergeView", () => {
  test("tags every comment with its own post across posts", async () => {
    mocks.findByIds.mockResolvedValue([
      post("p1", "ext-1"),
      post("p2", "ext-2"),
    ])
    mocks.findThreads.mockResolvedValue([
      {
        contactId: "k1",
        id: "conv-1",
        postExternalId: "ext-1",
      },
      {
        contactId: "k2",
        id: "conv-2",
        postExternalId: "ext-2",
      },
    ])
    mocks.listComments.mockResolvedValue({
      data: [
        comment({ conversationId: "conv-2", id: "m2" }),
        comment({ conversationId: "conv-1", id: "m1" }),
      ],
      nextCursor: null,
    })
    mocks.findCommenters.mockResolvedValue([])

    const page = await channelPostCommentsService.mergeView({
      ...base,
      postIds: ["p1", "p2"],
    })

    expect(page.items.map((item) => [item.id, item.postId])).toEqual([
      ["m2", "p2"],
      ["m1", "p1"],
    ])
    expect(mocks.listComments.mock.calls[0][0].filter.conversationIds).toEqual([
      "conv-1",
      "conv-2",
    ])
  })

  test("a post id that does not exist fails the whole read", async () => {
    mocks.findByIds.mockResolvedValue([post("p1", "ext-1")])

    await expect(
      channelPostCommentsService.mergeView({ ...base, postIds: ["p1", "p9"] }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("rejects none or too many posts", async () => {
    await expect(
      channelPostCommentsService.mergeView({ ...base, postIds: [] }),
    ).rejects.toMatchObject({ code: "validation" })

    const tooMany = Array.from(
      { length: MAX_MERGE_VIEW_POSTS + 1 },
      (_, index) => String(index + 1),
    )
    await expect(
      channelPostCommentsService.mergeView({ ...base, postIds: tooMany }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.findByIds).not.toHaveBeenCalled()
  })
})

describe("like and delete", () => {
  const createdAt = new Date("2026-11-22T10:00:00.123Z")
  const conversation = { id: "conv-1", sourceId: "ext-1" }
  const contactInbox = { id: "ci-1", inboxId: "inbox-1" }
  const message = {
    contactInboxId: "ci-1",
    conversationId: "conv-1",
    createdAt,
    deletedAt: null,
    id: "m1",
    sourceId: "fb-comment-1",
    type: "comment",
  }
  const target = {
    commentId: "m1",
    createdAt,
    postId: "p1",
    workspaceId: "ws-1",
  }

  beforeEach(() => {
    mocks.findMessage.mockResolvedValue(message)
    mocks.findConversation.mockResolvedValue(conversation)
    mocks.findContactInbox.mockResolvedValue(contactInbox)
    mocks.deleteMessage.mockResolvedValue([{ id: "m1" }])
  })

  test("like queues the channel job with the conversation and inbox of the comment", async () => {
    const result = await channelPostCommentsService.like({
      ...target,
      liked: true,
    })

    expect(result).toEqual({ liked: true })
    expect(mocks.chatQueueAdd).toHaveBeenCalledWith(
      "changeChannelMessageState",
      {
        type: "changeChannelMessageState",
        data: {
          contactInbox,
          conversation,
          liked: true,
          message: { createdAt, id: "m1" },
        },
      },
    )
  })

  test("delete queues the channel job first, under a fixed job id, then removes the comment in the inbox", async () => {
    const order: string[] = []
    mocks.chatQueueAdd.mockImplementation(() => {
      order.push("queue")
      return Promise.resolve()
    })
    mocks.deleteMessage.mockImplementation(() => {
      order.push("inbox")
      return Promise.resolve([{ id: "m1" }])
    })
    mocks.queueRealtime.mockImplementation(() => {
      order.push("realtime")
      return Promise.resolve()
    })

    const result = await channelPostCommentsService.delete(target)

    expect(result).toEqual({ deletedMessageIds: ["m1"] })
    expect(order).toEqual(["queue", "inbox", "realtime"])
    expect(mocks.chatQueueAdd).toHaveBeenCalledWith(
      "deleteChannelMessage",
      {
        type: "deleteChannelMessage",
        data: {
          contactInbox,
          conversation,
          message: { createdAt, id: "m1" },
        },
      },
      { jobId: "delete-comment-m1" },
    )
    expect(mocks.deleteMessage).toHaveBeenCalledWith({
      createdAt,
      id: "m1",
      sourceId: "fb-comment-1",
      workspaceId: "ws-1",
    })
    expect(mocks.queueRealtime).toHaveBeenCalledWith("ws-1", {
      data: { messageIds: ["m1"] },
      eventType: "messageDeleted",
      route: { conversation: "conv-1" },
    })
  })

  test("if the channel job cannot be queued the call fails and the comment stays", async () => {
    mocks.chatQueueAdd.mockRejectedValueOnce(new Error("redis down"))

    await expect(channelPostCommentsService.delete(target)).rejects.toThrow(
      "redis down",
    )
    expect(mocks.deleteMessage).not.toHaveBeenCalled()
    expect(mocks.queueRealtime).not.toHaveBeenCalled()
  })

  test("a retry after a failed local delete reuses the job id, so the channel delete runs once", async () => {
    mocks.deleteMessage.mockRejectedValueOnce(new Error("db down"))

    await expect(channelPostCommentsService.delete(target)).rejects.toThrow(
      "db down",
    )
    await channelPostCommentsService.delete(target)

    const jobIds = mocks.chatQueueAdd.mock.calls.map(
      ([, , options]) => options?.jobId,
    )
    expect(jobIds).toEqual(["delete-comment-m1", "delete-comment-m1"])
  })

  test("a comment in another inbox that shares the post's external id is not found", async () => {
    mocks.findContactInbox.mockResolvedValue({
      id: "ci-9",
      inboxId: "inbox-other",
    })

    await expect(
      channelPostCommentsService.like({ ...target, liked: true }),
    ).rejects.toMatchObject({ code: "notFound" })
    await expect(
      channelPostCommentsService.delete(target),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
    expect(mocks.deleteMessage).not.toHaveBeenCalled()
  })

  test.each([
    ["like", "instagram"],
    ["like", "threads"],
    ["delete", "threads"],
  ] as const)("%s on %s is a 409 and does nothing", async (action, channel) => {
    mocks.findByIds.mockResolvedValue([post("p1", "ext-1", channel)])

    const run =
      action === "like"
        ? channelPostCommentsService.like({ ...target, liked: true })
        : channelPostCommentsService.delete(target)

    await expect(run).rejects.toMatchObject({
      code: COMMENT_ACTION_UNSUPPORTED_CODE,
      httpStatusCode: 409,
    })
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
    expect(mocks.deleteMessage).not.toHaveBeenCalled()
  })

  test.each([
    ["messenger", "like"],
    ["tiktok", "like"],
    ["instagram", "delete"],
    ["tiktok", "delete"],
  ] as const)("%s supports %s", async (channel, action) => {
    mocks.findByIds.mockResolvedValue([post("p1", "ext-1", channel)])

    await (action === "like"
      ? channelPostCommentsService.like({ ...target, liked: false })
      : channelPostCommentsService.delete(target))

    expect(mocks.chatQueueAdd).toHaveBeenCalledTimes(1)
  })

  test("a comment of another post's thread is not found", async () => {
    mocks.findConversation.mockResolvedValue({
      id: "conv-1",
      sourceId: "someone-elses-post",
    })

    await expect(
      channelPostCommentsService.delete(target),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.deleteMessage).not.toHaveBeenCalled()
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
  })

  test("a message that is not a comment, a removed comment, or a missing one is not found", async () => {
    for (const found of [
      { ...message, type: "message" },
      { ...message, deletedAt: new Date() },
      null,
    ]) {
      mocks.findMessage.mockResolvedValueOnce(found)
      await expect(
        channelPostCommentsService.like({ ...target, liked: true }),
      ).rejects.toMatchObject({ code: "notFound" })
    }
    expect(mocks.chatQueueAdd).not.toHaveBeenCalled()
  })

  test("a post that does not exist is not found", async () => {
    mocks.findByIds.mockResolvedValue([])

    await expect(
      channelPostCommentsService.like({ ...target, liked: true }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.findMessage).not.toHaveBeenCalled()
  })
})

describe("one reader over many pages", () => {
  const stage = (pages: { items: unknown[]; nextCursor?: unknown }[]) => {
    let call = 0
    mocks.listComments.mockImplementation(() =>
      Promise.resolve({
        data: pages[call]?.items ?? [],
        nextCursor: pages[call++]?.nextCursor ?? null,
      }),
    )
  }

  test("resolves the posts and threads once, whatever the page count", async () => {
    stage([{ items: [comment()] }, { items: [comment({ id: "m2" })] }])

    const reader = await channelPostCommentsService.openReader({
      ...base,
      postIds: ["p1"],
    })
    await reader.readPage({ limit: 10 })
    await reader.readPage({ limit: 10 })

    expect(mocks.findByIds).toHaveBeenCalledTimes(1)
    expect(mocks.findThreads).toHaveBeenCalledTimes(1)
    expect(mocks.listComments).toHaveBeenCalledTimes(2)
  })

  test("looks up only the commenters on the page, not every thread's contact", async () => {
    mocks.findThreads.mockResolvedValue([
      {
        contactId: "k1",
        id: "conv-1",
        postExternalId: "ext-1",
      },
      {
        contactId: "k2",
        id: "conv-2",
        postExternalId: "ext-1",
      },
    ])
    stage([{ items: [comment({ conversationId: "conv-2" })] }])

    const reader = await channelPostCommentsService.openReader({
      ...base,
      postIds: ["p1"],
    })
    await reader.readPage({ limit: 10 })

    expect(mocks.findCommenters).toHaveBeenCalledWith({
      contactIds: ["k2"],
      workspaceId: "ws-1",
    })
  })

  test("preloading looks every commenter up once and the pages then reuse them", async () => {
    mocks.findThreads.mockResolvedValue([
      {
        contactId: "k1",
        id: "conv-1",
        postExternalId: "ext-1",
      },
      {
        contactId: "k2",
        id: "conv-2",
        postExternalId: "ext-1",
      },
    ])
    stage([{ items: [comment()] }, { items: [comment({ id: "m2" })] }])

    const reader = await channelPostCommentsService.openReader({
      ...base,
      postIds: ["p1"],
    })
    await reader.preloadCommenters()
    await reader.readPage({ limit: 10 })
    await reader.readPage({ limit: 10 })

    expect(mocks.findCommenters).toHaveBeenCalledTimes(1)
    expect(mocks.findCommenters).toHaveBeenCalledWith({
      contactIds: ["k1", "k2"],
      workspaceId: "ws-1",
    })
  })

  test("a post with no threads reads no messages on any page", async () => {
    mocks.findThreads.mockResolvedValue([])

    const reader = await channelPostCommentsService.openReader({
      ...base,
      postIds: ["p1"],
    })

    expect(await reader.readPage({ limit: 10 })).toEqual({ items: [] })
    expect(mocks.listComments).not.toHaveBeenCalled()
  })

  test("hands the posts' captions to the caller", async () => {
    mocks.findByIds.mockResolvedValue([
      { ...post("p1", "ext-1"), caption: "Flash sale" },
    ])

    const reader = await channelPostCommentsService.openReader({
      ...base,
      postIds: ["p1"],
    })

    expect(reader.posts).toEqual([
      expect.objectContaining({ caption: "Flash sale", id: "p1" }),
    ])
  })
})

describe("posts that share an external id across inboxes", () => {
  const sharedPosts = () =>
    mocks.findByIds.mockResolvedValue([
      post("p1", "shared", "messenger", "inbox-1"),
      post("p2", "shared", "messenger", "inbox-2"),
    ])

  test("each comment is attributed to the post of its own contact inbox's inbox", async () => {
    sharedPosts()
    // One contact merged across both inboxes: one conversation, two contact inboxes.
    mocks.findThreads.mockResolvedValue([
      { contactId: "k1", id: "conv-1", postExternalId: "shared" },
    ])
    mocks.findContactInboxes.mockResolvedValue([
      { contactId: "k1", id: "ci-a", inboxId: "inbox-1" },
      { contactId: "k1", id: "ci-b", inboxId: "inbox-2" },
    ])
    mocks.listComments.mockResolvedValue({
      data: [
        comment({ contactInboxId: "ci-b", id: "m2" }),
        comment({ contactInboxId: "ci-a", id: "m1" }),
      ],
      nextCursor: null,
    })
    mocks.findCommenters.mockResolvedValue([])

    const page = await channelPostCommentsService.mergeView({
      ...base,
      postIds: ["p1", "p2"],
    })

    expect(page.items.map((item) => [item.id, item.postId])).toEqual([
      ["m2", "p2"],
      ["m1", "p1"],
    ])
    expect(mocks.findThreads).toHaveBeenCalledWith({
      posts: [
        { externalPostId: "shared", inboxId: "inbox-1" },
        { externalPostId: "shared", inboxId: "inbox-2" },
      ],
      workspaceId: "ws-1",
    })
    expect(mocks.findContactInboxes).toHaveBeenCalledWith({
      contactIds: ["k1"],
      inboxIds: ["inbox-1", "inbox-2"],
    })
  })

  test("a post reads only its own inbox's contact inboxes, so another inbox's comments never enter", async () => {
    mocks.findByIds.mockResolvedValue([
      post("p1", "shared", "messenger", "inbox-1"),
    ])
    mocks.findThreads.mockResolvedValue([
      { contactId: "k1", id: "conv-1", postExternalId: "shared" },
    ])
    // The lookup is asked for inbox-1 only and answers with that inbox's row.
    mocks.findContactInboxes.mockResolvedValue([
      { contactId: "k1", id: "ci-a", inboxId: "inbox-1" },
    ])

    await channelPostCommentsService.list({ ...base, postId: "p1" })

    expect(mocks.findContactInboxes).toHaveBeenCalledWith({
      contactIds: ["k1"],
      inboxIds: ["inbox-1"],
    })
    expect(mocks.listComments.mock.calls[0][0].filter.contactInboxIds).toEqual([
      "ci-a",
    ])
  })

  test("a comment whose contact inbox is of an inbox that is not one of the posts' is dropped", async () => {
    mocks.findContactInboxes.mockResolvedValue([
      { contactId: "k1", id: "ci-1", inboxId: "inbox-other" },
    ])

    const page = await channelPostCommentsService.list({
      ...base,
      postId: "p1",
    })

    expect(page.items).toEqual([])
  })

  test("a comment with no known contact inbox is dropped, not misattributed", async () => {
    mocks.listComments.mockResolvedValue({
      data: [comment({ contactInboxId: "ci-unknown" })],
      nextCursor: null,
    })

    const page = await channelPostCommentsService.list({
      ...base,
      postId: "p1",
    })

    expect(page.items).toEqual([])
  })

  test("with no contact inbox in the posts' inboxes nothing is read", async () => {
    mocks.findContactInboxes.mockResolvedValue([])

    const page = await channelPostCommentsService.list({
      ...base,
      postId: "p1",
    })

    expect(page).toEqual({ items: [] })
    expect(mocks.listComments).not.toHaveBeenCalled()
  })
})

describe("a viewer without phone permission", () => {
  const denied = { ...base, canViewEmailAndPhone: false }

  test.each([
    "0901234567",
    "090",
    "09 01 23 45 67",
    "my number 0912 345 678",
    "2026",
    "hello",
  ])("may search for %j, which the database runs over the masked text", async (search) => {
    await channelPostCommentsService.list({ ...denied, postId: "p1", search })

    expect(mocks.listComments).toHaveBeenCalledTimes(1)
    expect(mocks.listComments.mock.calls[0][0].filter).toMatchObject({
      redactPhones: true,
      search,
    })
  })

  test("list, merge view and export all search the masked text", async () => {
    await channelPostCommentsService.list({
      ...denied,
      postId: "p1",
      search: "09 01",
    })
    await channelPostCommentsService.mergeView({
      ...denied,
      postIds: ["p1"],
      search: "09 01",
    })
    const reader = await channelPostCommentsService.openReader({
      ...denied,
      postIds: ["p1"],
      search: "09 01",
    })
    await reader.readPage({ limit: 10 })

    for (const [call] of mocks.listComments.mock.calls) {
      expect(call.filter.redactPhones).toBe(true)
    }
    expect(mocks.listComments).toHaveBeenCalledTimes(3)
  })

  test("the phone filter itself stays refused", async () => {
    await expect(
      channelPostCommentsService.list({
        ...denied,
        hasPhone: true,
        postId: "p1",
      }),
    ).rejects.toMatchObject({ code: "validation" })
    expect(mocks.listComments).not.toHaveBeenCalled()
  })

  test("a viewer who may see numbers searches the stored text", async () => {
    await channelPostCommentsService.list({
      ...base,
      postId: "p1",
      search: "0901234567",
    })

    expect(mocks.listComments.mock.calls[0][0].filter).toMatchObject({
      redactPhones: false,
      search: "0901234567",
    })
  })
})

describe("channelPostCommentsService.countPhoneComments", () => {
  test("counts the post's comments that carry a phone number, within a limit", async () => {
    mocks.countComments.mockResolvedValue({ capped: false, count: 4 })

    const result = await channelPostCommentsService.countPhoneComments({
      limit: 100,
      postId: "p1",
      workspaceId: "ws-1",
    })

    expect(result).toEqual({ capped: false, count: 4 })
    expect(mocks.countComments).toHaveBeenCalledWith({
      filter: {
        contactInboxIds: ["ci-1", "ci-2"],
        conversationIds: ["conv-1"],
        hasPhone: true,
        redactPhones: false,
        search: undefined,
      },
      limit: 100,
      workspaceId: "ws-1",
    })
  })

  test("counts nothing for a post with no threads", async () => {
    mocks.findThreads.mockResolvedValue([])

    expect(
      await channelPostCommentsService.countPhoneComments({
        limit: 100,
        postId: "p1",
        workspaceId: "ws-1",
      }),
    ).toEqual({ capped: false, count: 0 })
    expect(mocks.countComments).not.toHaveBeenCalled()
  })

  test("reports a capped count as a lower bound", async () => {
    mocks.countComments.mockResolvedValue({ capped: true, count: 100 })

    expect(
      await channelPostCommentsService.countPhoneComments({
        limit: 100,
        postId: "p1",
        workspaceId: "ws-1",
      }),
    ).toEqual({ capped: true, count: 100 })
  })

  describe("when the thread lookup reached its cap", () => {
    const threads = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        contactId: `k${index}`,
        id: `conv-${index}`,
        postExternalId: "ext-1",
      }))
    const count = () =>
      channelPostCommentsService.countPhoneComments({
        limit: 100,
        postId: "p1",
        workspaceId: "ws-1",
      })

    test.each([
      3, 4,
    ])("%i threads (at or over the cap) is reported as capped, with no message count read", async (length) => {
      mocks.findThreads.mockResolvedValue(threads(length))

      expect(await count()).toMatchObject({ capped: true })
      expect(mocks.countComments).not.toHaveBeenCalled()
    })

    test.each([
      [3, true],
      [2, false],
    ])("an opened reader over %i threads exposes threadsCapped=%s", async (length, expected) => {
      mocks.findThreads.mockResolvedValue(threads(length))

      const reader = await channelPostCommentsService.openReader({
        canViewEmailAndPhone: true,
        hasPhone: false,
        postIds: ["p1"],
        search: undefined,
        workspaceId: "ws-1",
      })

      expect(reader.threadsCapped).toBe(expected)
    })

    test("fewer threads than the cap is not capped by the lookup", async () => {
      mocks.findThreads.mockResolvedValue(threads(2))
      mocks.countComments.mockResolvedValue({ capped: false, count: 4 })

      expect(await count()).toEqual({ capped: false, count: 4 })
    })
  })
})
