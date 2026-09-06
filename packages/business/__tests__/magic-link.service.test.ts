import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  isUniqueViolationError: vi.fn(() => false),
  insertValues: vi.fn(),
  insert: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: mocks.insert,
    query: {
      magicLinkModel: {
        findMany: mocks.findMany,
        findFirst: mocks.findFirst,
      },
    },
    $count: mocks.count,
  },
  isUniqueViolationError: mocks.isUniqueViolationError,
  relationsFilterToSQL: mocks.relationsFilterToSQL,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  magicLinkModel: { name: "magicLink.name" },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: (input: { page: number; perPage: number }) => ({
    limit: input.perPage,
    offset: (input.page - 1) * input.perPage,
  }),
  likeContains: (value: string) => `%${value}%`,
  parseOrderByAsObject: () => ({}),
}))

let nextId = 0
vi.mock("@chatbotx.io/utils", () => ({
  createId: () => `id-${nextId++}`,
}))

const { magicLinkService } = await import("../src/magic-link/service")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isUniqueViolationError.mockReturnValue(false)
  mocks.insert.mockReturnValue({ values: mocks.insertValues })
  mocks.insertValues.mockResolvedValue(undefined)
  mocks.findMany.mockResolvedValue([])
  mocks.count.mockResolvedValue(0)
})

describe("magicLinkService.list", () => {
  test("builds an OR(name, url) ilike where when a keyword is given", async () => {
    await magicLinkService.list({
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
      keyword: "promo",
    })

    const where = mocks.findMany.mock.calls[0]?.[0]?.where
    expect(where.OR).toContainEqual({ name: { ilike: "%promo%" } })
    expect(where.OR).toContainEqual({ url: { ilike: "%promo%" } })
  })

  test("applies no OR filter without a keyword", async () => {
    await magicLinkService.list({ workspaceId: "ws-1", page: 1, perPage: 10 })

    const where = mocks.findMany.mock.calls[0]?.[0]?.where
    expect(where).toEqual({ workspaceId: "ws-1" })
  })
})

describe("magicLinkService.create", () => {
  test("maps a unique violation to a validation exception on name", async () => {
    mocks.isUniqueViolationError.mockReturnValue(true)
    mocks.insertValues.mockRejectedValue(new Error("duplicate key"))

    await expect(
      magicLinkService.create({
        workspaceId: "ws-1",
        data: { name: "dup", url: "https://example.com" },
      }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "name",
      message: "Name is already taken",
    })
  })

  test("rethrows a non-unique-violation error", async () => {
    mocks.isUniqueViolationError.mockReturnValue(false)
    const error = new Error("connection lost")
    mocks.insertValues.mockRejectedValue(error)

    await expect(
      magicLinkService.create({
        workspaceId: "ws-1",
        data: { name: "ok", url: "https://example.com" },
      }),
    ).rejects.toThrow(error)
  })
})

describe("magicLinkService.findByName", () => {
  test("scopes the lookup by workspaceId and name", async () => {
    mocks.findFirst.mockResolvedValue({ id: "ml-1" })

    await magicLinkService.findByName({ workspaceId: "ws-1", name: "promo" })

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", name: "promo" },
    })
  })
})
