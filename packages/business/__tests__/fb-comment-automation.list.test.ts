import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
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
  },
  eq: (...args: unknown[]) => ({ eq: args }),
  inArray: (...args: unknown[]) => ({ inArray: args }),
  ne: (...args: unknown[]) => ({ ne: args }),
  relationsFilterToSQL: vi.fn(),
  sql: (...args: unknown[]) => ({ sql: args }),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  fbCommentAutomationTypes: { enum: { messenger: "messenger" } },
  igCommentAutomationTypes: { options: ["instagram", "instagramFacebook"] },
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

const { fbCommentAutomationService } = await import(
  "../src/fb-comment-automation/service"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findMany.mockResolvedValue([])
  mocks.findFirst.mockResolvedValue(undefined)
  mocks.count.mockResolvedValue(0)
})

describe("fbCommentAutomationService.list — folder filtering", () => {
  test("no folderId scopes to isNull", async () => {
    await fbCommentAutomationService.list({
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
    })

    const where = mocks.findMany.mock.calls[0]?.[0]?.where
    expect(where.folderId).toEqual({ isNull: true })
  })

  test("the root folder id scopes to isNull", async () => {
    await fbCommentAutomationService.list({
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
      folderId: "0",
    })

    const where = mocks.findMany.mock.calls[0]?.[0]?.where
    expect(where.folderId).toEqual({ isNull: true })
  })

  test("a real folder id passes through unchanged", async () => {
    await fbCommentAutomationService.list({
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
      folderId: "folder-42",
    })

    const where = mocks.findMany.mock.calls[0]?.[0]?.where
    expect(where.folderId).toBe("folder-42")
  })

  test("isActive: false is preserved, not dropped as falsy", async () => {
    await fbCommentAutomationService.list({
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
      isActive: false,
    })

    const where = mocks.findMany.mock.calls[0]?.[0]?.where
    expect(where.isActive).toBe(false)
  })

  test("isActive null or undefined maps to undefined", async () => {
    await fbCommentAutomationService.list({
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
      isActive: null,
    })

    const where = mocks.findMany.mock.calls[0]?.[0]?.where
    expect(where.isActive).toBeUndefined()
  })
})

describe("fbCommentAutomationService.findMessengerOrFail", () => {
  test("throws notFound when no row matches", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

    await expect(
      fbCommentAutomationService.findMessengerOrFail({
        workspaceId: "ws-1",
        id: "missing",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("returns the row when found", async () => {
    mocks.findFirst.mockResolvedValue({ id: "fb-1" })

    const result = await fbCommentAutomationService.findMessengerOrFail({
      workspaceId: "ws-1",
      id: "fb-1",
    })

    expect(result).toEqual({ id: "fb-1" })
  })
})

describe("fbCommentAutomationService.findInstagramOrFail", () => {
  test("throws notFound when no row matches", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

    await expect(
      fbCommentAutomationService.findInstagramOrFail({
        workspaceId: "ws-1",
        id: "missing",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })
})
