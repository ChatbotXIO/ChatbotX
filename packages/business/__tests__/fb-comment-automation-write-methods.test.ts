import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  assertDeletable: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  db: {
    query: {
      fbCommentAutomationModel: {
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
  fbCommentAutomationTypes: { enum: { messenger: "messenger" } },
  igCommentAutomationTypes: {
    options: ["instagram", "instagramFacebook"],
  },
  rootFolderId: "0",
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: {},
  fbCommentAutomationModel: { name: "fbCommentAutomation.name" },
  fbCommentAutomationReplyModel: {},
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

const { fbCommentAutomationService } = await import(
  "../src/fb-comment-automation/service"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findFirst.mockResolvedValue(undefined)
  mocks.assertDeletable.mockResolvedValue(undefined)
})

describe("fbCommentAutomationService — type-scoped writes", () => {
  test("updateMessenger 404s when the row is an instagram automation", async () => {
    // findMessengerOrFail's own query is type-scoped to "messenger", so a
    // real instagram row never surfaces here — findFirst resolves undefined.
    mocks.findFirst.mockResolvedValue(undefined)

    await expect(
      fbCommentAutomationService.updateMessenger(
        { workspaceId: "1", id: "9" },
        { name: "x" },
      ),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(mocks.update).not.toHaveBeenCalled()
  })

  test("deleteMessenger 404s when the row is an instagram automation", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

    await expect(
      fbCommentAutomationService.deleteMessenger({
        workspaceId: "1",
        id: "9",
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(mocks.delete).not.toHaveBeenCalled()
  })

  test("updateInstagram 404s when the row is a messenger automation", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

    await expect(
      fbCommentAutomationService.updateInstagram(
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
      fbCommentAutomationService.deleteInstagram({
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

    const result = await fbCommentAutomationService.updateMessenger(
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

    await fbCommentAutomationService.deleteMessenger({
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

    await fbCommentAutomationService.deleteMany({
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

    await fbCommentAutomationService.createMessenger({
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

    await fbCommentAutomationService.createInstagram({
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
})
