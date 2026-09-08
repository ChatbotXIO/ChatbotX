// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  $count: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      reflinkModel: {
        findMany: mocks.findMany,
        findFirst: mocks.findFirst,
      },
    },
    $count: mocks.$count,
  },
  relationsFilterToSQL: vi.fn((_model: unknown, where: unknown) => where),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  reflinkModel: { id: "id-col", workspaceId: "workspaceId-col" },
}))

const { reflinkRepository } = await import(
  "../src/repositories/reflink/repository"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("reflinkRepository.listPaginated", () => {
  test("scopes the query by workspaceId and forces type=refLink", async () => {
    const rows = [{ id: "reflink-1" }]
    mocks.findMany.mockResolvedValueOnce(rows)

    const result = await reflinkRepository.listPaginated({
      workspaceId: "ws-1",
      page: 1,
      perPage: 50,
    })

    expect(result).toEqual(rows)
    const where = mocks.findMany.mock.calls[0]?.[0]?.where
    expect(where).toEqual(
      expect.objectContaining({ workspaceId: "ws-1", type: "refLink" }),
    )
  })

  test("includes flow and customField relations", async () => {
    mocks.findMany.mockResolvedValueOnce([])

    await reflinkRepository.listPaginated({
      workspaceId: "ws-1",
      page: 1,
      perPage: 50,
    })

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ with: { flow: true, customField: true } }),
    )
  })

  test("filters by keyword using a contains-style ilike on name when given", async () => {
    mocks.findMany.mockResolvedValueOnce([])

    await reflinkRepository.listPaginated({
      workspaceId: "ws-1",
      keyword: "promo",
      page: 1,
      perPage: 50,
    })

    const where = mocks.findMany.mock.calls[0]?.[0]?.where
    expect(where.name).toEqual({ ilike: "%promo%" })
  })
})

describe("reflinkRepository.count", () => {
  test("counts rows scoped to the workspace and type=refLink", async () => {
    mocks.$count.mockResolvedValueOnce(2)

    const result = await reflinkRepository.count({ workspaceId: "ws-1" })

    expect(result).toBe(2)
    expect(mocks.$count).toHaveBeenCalledWith(
      { id: "id-col", workspaceId: "workspaceId-col" },
      expect.objectContaining({ workspaceId: "ws-1", type: "refLink" }),
    )
  })
})

describe("reflinkRepository.findByIdAndWorkspace", () => {
  test("scopes the lookup by id, workspaceId, and type=refLink", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "reflink-1" })

    const result = await reflinkRepository.findByIdAndWorkspace({
      id: "reflink-1",
      workspaceId: "ws-1",
    })

    expect(result).toEqual({ id: "reflink-1" })
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "reflink-1", workspaceId: "ws-1", type: "refLink" },
    })
  })

  test("returns undefined when no row matches", async () => {
    mocks.findFirst.mockResolvedValueOnce(undefined)

    const result = await reflinkRepository.findByIdAndWorkspace({
      id: "missing",
      workspaceId: "ws-1",
    })

    expect(result).toBeUndefined()
  })
})
