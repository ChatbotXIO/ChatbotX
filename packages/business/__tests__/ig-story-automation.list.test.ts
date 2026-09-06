import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      igStoryAutomationModel: {
        findMany: mocks.findMany,
        findFirst: mocks.findFirst,
      },
    },
    $count: mocks.count,
  },
  eq: (...args: unknown[]) => ({ eq: args }),
  relationsFilterToSQL: vi.fn(),
  sql: (...args: unknown[]) => ({ sql: args }),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  igStoryAutomationTypes: { options: ["instagram", "instagramFacebook"] },
  rootFolderId: "0",
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  igStoryAutomationModel: { name: "igStoryAutomation.name" },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: (input: { page: number; perPage: number }) => ({
    limit: input.perPage,
    offset: (input.page - 1) * input.perPage,
  }),
  likeContains: (value: string) => `%${value}%`,
  parseOrderByAsObject: () => ({}),
}))

const { igStoryAutomationService } = await import(
  "../src/ig-story-automation/service"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findMany.mockResolvedValue([])
  mocks.findFirst.mockResolvedValue(undefined)
  mocks.count.mockResolvedValue(0)
})

describe("igStoryAutomationService.list — folder filtering", () => {
  test("no folderId scopes to isNull", async () => {
    await igStoryAutomationService.list({
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
    })

    const where = mocks.findMany.mock.calls[0]?.[0]?.where
    expect(where.folderId).toEqual({ isNull: true })
  })

  test("the root folder id scopes to isNull", async () => {
    await igStoryAutomationService.list({
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
      folderId: "0",
    })

    const where = mocks.findMany.mock.calls[0]?.[0]?.where
    expect(where.folderId).toEqual({ isNull: true })
  })

  test("a real folder id passes through unchanged", async () => {
    await igStoryAutomationService.list({
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
      folderId: "folder-9",
    })

    const where = mocks.findMany.mock.calls[0]?.[0]?.where
    expect(where.folderId).toBe("folder-9")
  })

  test("isActive: false is preserved, not dropped as falsy", async () => {
    await igStoryAutomationService.list({
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
      isActive: false,
    })

    const where = mocks.findMany.mock.calls[0]?.[0]?.where
    expect(where.isActive).toBe(false)
  })

  test("isActive null or undefined maps to undefined", async () => {
    await igStoryAutomationService.list({
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
      isActive: undefined,
    })

    const where = mocks.findMany.mock.calls[0]?.[0]?.where
    expect(where.isActive).toBeUndefined()
  })
})

describe("igStoryAutomationService.findOrFail", () => {
  test("throws notFound when no row matches", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

    await expect(
      igStoryAutomationService.findOrFail({
        workspaceId: "ws-1",
        id: "missing",
      }),
    ).rejects.toMatchObject({ code: "notFound" })
  })

  test("returns the row when found", async () => {
    mocks.findFirst.mockResolvedValue({ id: "story-1" })

    const result = await igStoryAutomationService.findOrFail({
      workspaceId: "ws-1",
      id: "story-1",
    })

    expect(result).toEqual({ id: "story-1" })
  })
})
