import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  assertDeletable: vi.fn(),
  flowExists: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  db: {
    query: {
      commentAutomationModel: {
        findMany: mocks.findMany,
        findFirst: mocks.findFirst,
      },
    },
    $count: mocks.count,
    insert: mocks.insert,
    update: mocks.update,
    delete: mocks.delete,
  },
  eq: (...args: unknown[]) => ({ eq: args }),
  inArray: (...args: unknown[]) => ({ inArray: args }),
  ne: (...args: unknown[]) => ({ ne: args }),
  relationsFilterToSQL: vi.fn(),
  sql: (...args: unknown[]) => ({ sql: args }),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  commentAutomationTypes: { enum: { messenger: "messenger" } },
  igCommentAutomationTypes: {
    options: ["instagram", "instagramFacebook"],
  },
  rootFolderId: "0",
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: {},
  commentAutomationModel: { name: "commentAutomation.name" },
  commentAutomationReplyModel: {},
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: (input: { page: number; perPage: number }) => ({
    limit: input.perPage,
    offset: (input.page - 1) * input.perPage,
  }),
  likeContains: (value: string) => `%${value}%`,
  parseOrderByAsObject: () => ({}),
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "id-1",
}))

vi.mock("date-fns-tz", () => ({
  formatInTimeZone: () => "00:00",
}))

vi.mock("../src/template/installed-resource.service", () => ({
  assertDeletable: mocks.assertDeletable,
}))

vi.mock("../src/flow/service", () => ({
  flowService: { exists: mocks.flowExists },
}))

const { commentAutomationService } = await import(
  "../src/comment-automation/service"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findFirst.mockResolvedValue(undefined)
  mocks.assertDeletable.mockResolvedValue(undefined)
  mocks.flowExists.mockResolvedValue(true)
})

describe("commentAutomationService — type-scoped writes", () => {
  test("updateMessenger 404s when the row is an instagram automation", async () => {
    // findMessengerOrFail's own query is type-scoped to "messenger", so a
    // real instagram row never surfaces here — findFirst resolves undefined.
    mocks.findFirst.mockResolvedValue(undefined)

    await expect(
      commentAutomationService.updateMessenger(
        { workspaceId: "1", id: "9" },
        { name: "x" },
      ),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("deleteMessenger 404s when the row is an instagram automation", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

    await expect(
      commentAutomationService.deleteMessenger({
        workspaceId: "1",
        id: "9",
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(mocks.delete).not.toHaveBeenCalled()
  })

  test("updateInstagram 404s when the row is a messenger automation", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

    await expect(
      commentAutomationService.updateInstagram(
        { workspaceId: "1", id: "9" },
        { name: "x" },
      ),
    ).rejects.toMatchObject({
      code: "notFound",
      message: "Instagram Comment Automation not found",
    })

    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("deleteInstagram 404s when the row is a messenger automation", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

    await expect(
      commentAutomationService.deleteInstagram({
        workspaceId: "1",
        id: "9",
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(mocks.delete).not.toHaveBeenCalled()
  })

  test("updateMessenger updates the row scoped to workspace, id, and the messenger type", async () => {
    mocks.findFirst.mockResolvedValue({ id: "9", type: "messenger" })
    const returning = vi.fn().mockResolvedValue([{ id: "9", name: "x" }])
    const where = vi.fn(() => ({ returning }))
    const set = vi.fn(() => ({ where }))
    mocks.update.mockReturnValue({ set })

    const result = await commentAutomationService.updateMessenger(
      { workspaceId: "1", id: "9" },
      { name: "x" },
    )

    expect(result).toEqual({ id: "9", name: "x" })
    expect(set).toHaveBeenCalledWith({ name: "x" })
  })

  test("deleteMessenger deletes through deleteMany scoped to the messenger type only", async () => {
    mocks.findFirst.mockResolvedValue({ id: "9", type: "messenger" })
    const where = vi.fn().mockResolvedValue(undefined)
    mocks.delete.mockReturnValue({ where })

    await commentAutomationService.deleteMessenger({
      workspaceId: "1",
      id: "9",
    })

    expect(mocks.assertDeletable).toHaveBeenCalledWith({
      workspaceId: "1",
      resourceKind: "fbCommentAutomation",
      resourceIds: ["9"],
    })
    expect(mocks.delete).toHaveBeenCalled()
  })

  test("deleteMany filters by the caller-supplied types array", async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    mocks.delete.mockReturnValue({ where })

    await commentAutomationService.deleteMany({
      workspaceId: "1",
      ids: ["1", "2"],
      types: ["instagram", "instagramFacebook"],
    })

    const whereArg = where.mock.calls[0]?.[0] as { and: unknown[] }
    // The types filter is threaded into the compound where-clause as one of
    // the `inArray` conditions built by the mocked `and`/`inArray` helpers.
    expect(
      whereArg.and.some(
        (clause) =>
          JSON.stringify(clause).includes("instagram") &&
          JSON.stringify(clause).includes("instagramFacebook"),
      ),
    ).toBe(true)
  })

  test("createMessenger always inserts with type=messenger regardless of caller data", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "id-1" }])
    const values = vi.fn(() => ({ returning }))
    mocks.insert.mockReturnValue({ values })

    await commentAutomationService.createMessenger({
      workspaceId: "1",
      data: { name: "hello" },
    })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ type: "messenger", workspaceId: "1" }),
    )
  })

  test("createInstagram inserts with the caller-supplied instagram type", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "id-1" }])
    const values = vi.fn(() => ({ returning }))
    mocks.insert.mockReturnValue({ values })

    await commentAutomationService.createInstagram({
      workspaceId: "1",
      type: "instagramFacebook",
      data: { name: "hello" },
    })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "instagramFacebook",
        workspaceId: "1",
      }),
    )
  })

  test("createMessenger rejects a privateReply flow that does not exist in this workspace", async () => {
    mocks.flowExists.mockResolvedValue(false)

    await expect(
      commentAutomationService.createMessenger({
        workspaceId: "1",
        data: {
          name: "hello",
          privateReply: { type: "flow", value: "flow-from-another-space" },
        },
      }),
    ).rejects.toMatchObject({ field: "privateReply" })

    expect(mocks.flowExists).toHaveBeenCalledWith(
      "1",
      "flow-from-another-space",
      undefined,
    )
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  test("createMessenger rejects a publicReply flow that does not exist in this workspace", async () => {
    mocks.flowExists.mockResolvedValue(false)

    await expect(
      commentAutomationService.createMessenger({
        workspaceId: "1",
        data: {
          name: "hello",
          publicReply: { type: "flow", value: "flow-from-another-space" },
        },
      }),
    ).rejects.toMatchObject({ field: "publicReply" })

    expect(mocks.insert).not.toHaveBeenCalled()
  })

  test("createMessenger inserts when both reply flows exist in this workspace", async () => {
    mocks.flowExists.mockResolvedValue(true)
    const returning = vi.fn().mockResolvedValue([{ id: "id-1" }])
    const values = vi.fn(() => ({ returning }))
    mocks.insert.mockReturnValue({ values })

    await commentAutomationService.createMessenger({
      workspaceId: "1",
      data: {
        name: "hello",
        privateReply: { type: "flow", value: "flow-1" },
      },
    })

    expect(mocks.flowExists).toHaveBeenCalledWith("1", "flow-1", undefined)
    expect(values).toHaveBeenCalled()
  })

  test("createMessenger never calls flowService when neither reply is a flow", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "id-1" }])
    const values = vi.fn(() => ({ returning }))
    mocks.insert.mockReturnValue({ values })

    await commentAutomationService.createMessenger({
      workspaceId: "1",
      data: { name: "hello", privateReply: { type: "text", value: "hi" } },
    })

    expect(mocks.flowExists).not.toHaveBeenCalled()
  })

  test("updateInstagram rejects a privateReply flow from another workspace", async () => {
    mocks.findFirst.mockResolvedValue({ id: "9", type: "instagram" })
    mocks.flowExists.mockResolvedValue(false)

    await expect(
      commentAutomationService.updateInstagram(
        { workspaceId: "1", id: "9" },
        { privateReply: { type: "flow", value: "flow-from-another-space" } },
      ),
    ).rejects.toMatchObject({ field: "privateReply" })

    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("createThreadsAutomation rejects a publicReply flow from another workspace", async () => {
    mocks.flowExists.mockResolvedValue(false)

    await expect(
      commentAutomationService.createThreadsAutomation({
        workspaceId: "1",
        data: {
          name: "hello",
          post: { type: "all", value: [] },
          publicReply: { type: "flow", value: "flow-from-another-space" },
          includeKeywords: { type: "all", value: [] },
          excludeKeywords: [],
          options: {
            replyToNewContactsOnly: false,
            replyOncePerUserPerPost: false,
            replyToUsersWhoCommentedOnOtherPosts: true,
            ignoreCommentReplies: true,
          },
          replyAfter: { type: "immediately", value: 0 },
        },
      }),
    ).rejects.toMatchObject({ field: "publicReply" })

    expect(mocks.flowExists).toHaveBeenCalledWith(
      "1",
      "flow-from-another-space",
      expect.anything(),
    )
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  test("updateThreadsAutomation rejects a publicReply flow from another workspace", async () => {
    mocks.flowExists.mockResolvedValue(false)

    await expect(
      commentAutomationService.updateThreadsAutomation({
        workspaceId: "1",
        id: "9",
        data: {
          publicReply: { type: "flow", value: "flow-from-another-space" },
        },
      }),
    ).rejects.toMatchObject({ field: "publicReply" })

    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("createTiktokAutomation rejects a publicReply flow from another workspace", async () => {
    mocks.flowExists.mockResolvedValue(false)

    await expect(
      commentAutomationService.createTiktokAutomation({
        workspaceId: "1",
        data: {
          name: "hello",
          post: { type: "all", value: [] },
          publicReply: { type: "flow", value: "flow-from-another-space" },
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
      }),
    ).rejects.toMatchObject({ field: "publicReply" })

    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
