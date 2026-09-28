import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
  deleteWhere: vi.fn(),
  deleteReturning: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      commentAutomationModel: {
        findFirst: mocks.findFirst,
        findMany: mocks.findMany,
      },
      inboxModel: { findFirst: mocks.findFirst },
    },
    $count: mocks.count,
    insert: vi.fn(() => ({
      values: mocks.insertValues,
    })),
    update: vi.fn(() => ({
      set: mocks.updateSet,
    })),
    delete: vi.fn(() => ({
      where: mocks.deleteWhere,
    })),
  },
  and: (...conditions: unknown[]) => ({ and: conditions }),
  desc: (value: unknown) => ({ desc: value }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  isNull: (column: unknown) => ({ isNull: column }),
  or: (...conditions: unknown[]) => ({ or: conditions }),
  ne: (column: unknown, value: unknown) => ({ ne: [column, value] }),
  relationsFilterToSQL: vi.fn((_table: unknown, where: unknown) => where),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: strings.join("?"),
    values,
  }),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  commentAutomationTypes: {
    enum: {
      threads: "threads",
      messenger: "messenger",
      instagram: "instagram",
      instagramFacebook: "instagramFacebook",
      tiktok: "tiktok",
    },
  },
  // Same contract as the real one: a `text` reply gains a `values` list
  // mirroring `value`; every other type passes through untouched.
  normalizeReplyTexts: (reply: {
    type: string
    value: string | null
    values?: { value: string }[]
  }) =>
    reply.type === "text" && !reply.values
      ? { ...reply, values: [{ value: reply.value ?? "" }] }
      : reply,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: { contactId: "ContactInbox.contactId" },
  commentAutomationModel: {
    id: "CommentAutomation.id",
    workspaceId: "CommentAutomation.workspaceId",
    type: "CommentAutomation.type",
    createdAt: "CommentAutomation.createdAt",
    inboxId: "CommentAutomation.inboxId",
  },
  commentAutomationReplyModel: {
    automationId: "CommentAutomationReply.automationId",
    contactId: "CommentAutomationReply.contactId",
    postId: "CommentAutomationReply.postId",
  },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "generated-id",
}))

const { commentAutomationService } = await import(
  "../src/comment-automation/service"
)

describe("commentAutomationService threads CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findMany.mockResolvedValue([])
    mocks.findFirst.mockResolvedValue(null)
    mocks.count.mockResolvedValue(0)
    mocks.insertReturning.mockResolvedValue([{ id: "generated-id" }])
    mocks.insertValues.mockReturnValue({ returning: mocks.insertReturning })
    mocks.updateReturning.mockResolvedValue([{ id: "thread-1" }])
    mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning })
    mocks.updateSet.mockReturnValue({ where: mocks.updateWhere })
    mocks.deleteReturning.mockResolvedValue([{ id: "thread-1" }])
    mocks.deleteWhere.mockReturnValue({ returning: mocks.deleteReturning })
  })

  test("findActiveAutomations matches scoped and legacy rows at query boundary", async () => {
    const rows = [
      { id: "a", workspaceId: "workspace-1", type: "messenger", isActive: true, inboxId: "inbox-a" },
      { id: "b", workspaceId: "workspace-1", type: "messenger", isActive: true, inboxId: "inbox-b" },
      { id: "legacy", workspaceId: "workspace-1", type: "messenger", isActive: true, inboxId: null },
      { id: "wrong-workspace", workspaceId: "workspace-2", type: "messenger", isActive: true, inboxId: "inbox-a" },
      { id: "wrong-type", workspaceId: "workspace-1", type: "instagram", isActive: true, inboxId: "inbox-a" },
      { id: "inactive", workspaceId: "workspace-1", type: "messenger", isActive: false, inboxId: "inbox-a" },
    ]
    mocks.findMany.mockImplementation(({ where }) =>
      rows.filter(
        (row) =>
          row.workspaceId === where.workspaceId &&
          row.type === where.type &&
          row.isActive === where.isActive &&
          where.inboxId.OR.some((condition: { isNull?: boolean; eq?: string }) =>
            condition.isNull === true
              ? row.inboxId === null
              : row.inboxId === condition.eq,
          ),
      ),
    )
    await commentAutomationService.findActiveAutomations({
      workspaceId: "workspace-1",
      channelType: "messenger",
      inboxId: "inbox-a",
    })

    expect(mocks.findMany.mock.results[0]?.value).toEqual([
      { id: "a", workspaceId: "workspace-1", type: "messenger", isActive: true, inboxId: "inbox-a" },
      { id: "legacy", workspaceId: "workspace-1", type: "messenger", isActive: true, inboxId: null },
    ])
  })

  test("create hardcodes threads-only defaults", async () => {
    await commentAutomationService.createThreadsAutomation({
      workspaceId: "workspace-1",
      data: {
        name: "Threads auto reply",
        post: { type: "postIds", value: ["123"] },
        publicReply: { type: "text", value: "hi" },
        includeKeywords: { type: "contain", value: ["hello"] },
        excludeKeywords: ["spam"],
        options: {
          replyToNewContactsOnly: true,
          replyOncePerUserPerPost: true,
          likeUserComment: false,
          replyToUsersWhoCommentedOnOtherPosts: false,
          ignoreCommentReplies: false,
          trackUserTags: false,
        },
        replyAfter: { type: "minutes", value: 2 },
      },
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        type: "threads",
        privateReply: { type: "none", value: null },
        hideComments: {
          all: false,
          hasPhoneNumber: false,
          hasImage: false,
          hasVideo: false,
          hasLink: false,
          hasKeywords: false,
          hasGif: false,
          hasEmoji: false,
          keywords: [],
          showCommentsAfter: "none",
        },
        excludeKeywordsType: "contain",
        options: {
          replyToNewContactsOnly: true,
          replyOncePerUserPerPost: true,
          likeUserComment: false,
          replyToUsersWhoCommentedOnOtherPosts: false,
          ignoreCommentReplies: false,
          trackUserTags: false,
        },
      }),
    )
  })

  test("persists Threads inbox scope and preserves partial update semantics", async () => {
    mocks.findFirst.mockResolvedValue({ id: "inbox-a", workspaceId: "workspace-1", channel: "threads" })

    await commentAutomationService.createThreadsAutomation({
      workspaceId: "workspace-1",
      data: {
        name: "Scoped Threads",
        inboxId: "inbox-a",
        post: { type: "all", value: [] },
        publicReply: { type: "none", value: null },
        includeKeywords: { type: "all", value: [] },
        excludeKeywords: [],
        options: {
          replyToNewContactsOnly: false,
          replyOncePerUserPerPost: false,
          likeUserComment: false,
          replyToUsersWhoCommentedOnOtherPosts: true,
          ignoreCommentReplies: true,
        },
        replyAfter: { type: "immediately", value: 0 },
      },
    })
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ inboxId: "inbox-a" }),
    )

    await commentAutomationService.updateThreadsAutomation({
      workspaceId: "workspace-1",
      id: "thread-1",
      data: { inboxId: "inbox-b" },
    })
    expect(mocks.updateSet).toHaveBeenCalledWith({ inboxId: "inbox-b" })

    await commentAutomationService.updateThreadsAutomation({
      workspaceId: "workspace-1",
      id: "thread-1",
      data: { name: "unchanged scope" },
    })
    expect(mocks.updateSet).toHaveBeenCalledWith({ name: "unchanged scope" })

    await commentAutomationService.updateThreadsAutomation({
      workspaceId: "workspace-1",
      id: "thread-1",
      data: { inboxId: null },
    })
    expect(mocks.updateSet).toHaveBeenCalledWith({ inboxId: null })
  })

  test("rejects a Threads inbox outside workspace", async () => {
    mocks.findFirst.mockResolvedValue(null)

    await expect(
      commentAutomationService.updateThreadsAutomation({
        workspaceId: "workspace-1",
        id: "thread-1",
        data: { inboxId: "foreign-inbox" },
      }),
    ).rejects.toMatchObject({ field: "inboxId" })
  })

  test("persists TikTok inbox scope on create and update", async () => {
    mocks.findFirst.mockResolvedValue({ id: "inbox-a", workspaceId: "workspace-1", channel: "tiktok" })
    const data = {
      name: "Scoped TikTok",
      inboxId: "inbox-a",
      post: { type: "all" as const, value: [] },
      publicReply: { type: "none" as const, value: null },
      privateReply: { type: "none" as const, value: null },
      includeKeywords: { type: "all" as const, value: [] },
      excludeKeywords: [],
      options: {
        replyToNewContactsOnly: false,
        replyOncePerUserPerPost: false,
        likeUserComment: false,
        replyToUsersWhoCommentedOnOtherPosts: true,
        ignoreCommentReplies: true,
      },
      replyAfter: { type: "immediately" as const, value: 0 },
    }

    await commentAutomationService.createTiktokAutomation({
      workspaceId: "workspace-1",
      data,
    })
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ inboxId: "inbox-a" }),
    )

    await commentAutomationService.updateTiktokAutomation({
      workspaceId: "workspace-1",
      id: "tiktok-1",
      data: { inboxId: null },
    })
    expect(mocks.updateSet).toHaveBeenCalledWith({ inboxId: null })
  })

  test("update only allows supported mutable fields", async () => {
    await commentAutomationService.updateThreadsAutomation({
      workspaceId: "workspace-1",
      id: "thread-1",
      data: {
        name: "Updated",
        publicReply: { type: "flow", value: "flow-1" },
        options: {
          replyToNewContactsOnly: true,
          replyOncePerUserPerPost: false,
          likeUserComment: false,
          replyToUsersWhoCommentedOnOtherPosts: true,
          ignoreCommentReplies: true,
          trackUserTags: false,
        },
      },
    })

    expect(mocks.updateSet).toHaveBeenCalledWith({
      name: "Updated",
      publicReply: { type: "flow", value: "flow-1" },
      options: {
        replyToNewContactsOnly: true,
        replyOncePerUserPerPost: false,
        likeUserComment: false,
        replyToUsersWhoCommentedOnOtherPosts: true,
        ignoreCommentReplies: true,
        trackUserTags: false,
      },
    })
    expect(JSON.stringify(mocks.updateWhere.mock.calls[0]?.[0])).toContain(
      "threads",
    )
  })

  test("list and get stay scoped to workspace and threads type", async () => {
    await commentAutomationService.listThreadsAutomations({
      workspaceId: "workspace-1",
      isActive: true,
      limit: 10,
      offset: 0,
      orderBy: { createdAt: "asc" },
    })
    await commentAutomationService.getThreadsAutomation({
      workspaceId: "workspace-1",
      id: "thread-1",
    })

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace-1",
          type: "threads",
          isActive: true,
        }),
        orderBy: { createdAt: "asc" },
      }),
    )
    expect(mocks.count).toHaveBeenCalledOnce()
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        id: "thread-1",
        workspaceId: "workspace-1",
        type: "threads",
      },
    })
  })

  test("delete stays scoped to workspace and threads type", async () => {
    await commentAutomationService.deleteThreadsAutomation({
      workspaceId: "workspace-1",
      id: "thread-1",
    })

    expect(JSON.stringify(mocks.deleteWhere.mock.calls[0]?.[0])).toContain(
      "workspace-1",
    )
    expect(JSON.stringify(mocks.deleteWhere.mock.calls[0]?.[0])).toContain(
      "threads",
    )
  })
})
