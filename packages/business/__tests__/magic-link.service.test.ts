import { beforeEach, describe, expect, test, vi } from "vitest"

// The broadcast policy import reaches quota/workspace modules these narrow mocks omit.
vi.mock("../src/broadcast/plan-policy.service", () => ({
  broadcastPlanPolicyService: {},
}))

const mocks = vi.hoisted(() => ({
  isUniqueViolationError: vi.fn(() => false),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  insert: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
  deleteWhere: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...conditions: unknown[]) => ({ and: conditions }),
  eq: (column: unknown, value: unknown) => ({ eq: [column, value] }),
  inArray: (column: unknown, values: unknown) => ({
    inArray: [column, values],
  }),
  db: {
    insert: mocks.insert,
    update: () => ({ set: mocks.updateSet }),
    delete: () => ({ where: mocks.deleteWhere }),
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
  magicLinkModel: {
    id: "magicLink.id",
    name: "magicLink.name",
    workspaceId: "magicLink.workspaceId",
  },
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
  mocks.insertValues.mockReturnValue({ returning: mocks.insertReturning })
  mocks.insertReturning.mockResolvedValue([{ id: "ml-new" }])
  mocks.updateSet.mockReturnValue({ where: mocks.updateWhere })
  mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning })
  mocks.updateReturning.mockResolvedValue([{ id: "ml-1", name: "renamed" }])
  mocks.deleteWhere.mockResolvedValue(undefined)
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
    mocks.insertReturning.mockRejectedValue(new Error("duplicate key"))

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
    mocks.insertReturning.mockRejectedValue(error)

    await expect(
      magicLinkService.create({
        workspaceId: "ws-1",
        data: { name: "ok", url: "https://example.com" },
      }),
    ).rejects.toThrow(error)
  })
})

describe("magicLinkService.create result", () => {
  test("returns the inserted row", async () => {
    const created = await magicLinkService.create({
      workspaceId: "ws-1",
      data: { name: "promo", url: "https://example.com" },
    })

    expect(created).toEqual({ id: "ml-new" })
  })
})

describe("magicLinkService.update", () => {
  test("throws not found for a link outside the workspace", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

    await expect(
      magicLinkService.update({
        workspaceId: "ws-1",
        id: "ml-other",
        data: { name: "renamed" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.updateSet).not.toHaveBeenCalled()
  })

  test("scopes the write to the workspace and returns the row", async () => {
    mocks.findFirst.mockResolvedValue({ id: "ml-1" })

    const updated = await magicLinkService.update({
      workspaceId: "ws-1",
      id: "ml-1",
      data: { name: "renamed" },
    })

    expect(updated).toEqual({ id: "ml-1", name: "renamed" })
    expect(mocks.updateSet).toHaveBeenCalledWith({ name: "renamed" })
    expect(JSON.stringify(mocks.updateWhere.mock.calls[0]?.[0])).toContain(
      "ws-1",
    )
  })

  test("maps a unique violation to a validation exception on name", async () => {
    mocks.findFirst.mockResolvedValue({ id: "ml-1" })
    mocks.isUniqueViolationError.mockReturnValue(true)
    mocks.updateReturning.mockRejectedValue(new Error("duplicate key"))

    await expect(
      magicLinkService.update({
        workspaceId: "ws-1",
        id: "ml-1",
        data: { name: "dup" },
      }),
    ).rejects.toMatchObject({ code: "validation", field: "name" })
  })
})

describe("magicLinkService.deleteMany", () => {
  test("scopes the delete to the workspace", async () => {
    await magicLinkService.deleteMany({ workspaceId: "ws-1", ids: ["ml-1"] })

    const where = JSON.stringify(mocks.deleteWhere.mock.calls[0]?.[0])
    expect(where).toContain("ws-1")
    expect(where).toContain("ml-1")
  })

  test("skips the query for an empty id list", async () => {
    await magicLinkService.deleteMany({ workspaceId: "ws-1", ids: [] })

    expect(mocks.deleteWhere).not.toHaveBeenCalled()
  })
})

describe("magicLinkService.delete", () => {
  test("throws not found before deleting a link outside the workspace", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

    await expect(
      magicLinkService.delete({ workspaceId: "ws-1", id: "ml-other" }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(mocks.deleteWhere).not.toHaveBeenCalled()
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
