// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => {
  const selectWhereLimitOffset = {
    limit: vi.fn(),
  }
  const selectWhere = {
    limit: vi.fn(() => selectWhereLimitOffset),
    where: vi.fn(),
  }
  const selectFrom = {
    where: vi.fn(() => selectWhere),
  }
  const select = vi.fn(() => ({ from: vi.fn(() => selectFrom) }))
  return {
    select,
    selectFrom,
    selectWhere,
    selectWhereLimitOffset,
    findFirst: vi.fn(),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  count: vi.fn(() => "count-expr"),
  db: {
    select: mocks.select,
    query: {
      triggerModel: { findFirst: mocks.findFirst },
    },
  },
  eq: vi.fn((field: unknown, value: unknown) => ({ eq: [field, value] })),
  isNull: vi.fn((field: unknown) => ({ isNull: field })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  triggerModel: { workspaceId: "workspaceId-col", folderId: "folderId-col" },
}))

const { triggerRepository } = await import(
  "../src/repositories/trigger/repository"
)

describe("triggerRepository.listPaginated", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("resolves an empty-string folderId to isNull (trigger sentinel, not rootFolderId)", async () => {
    const rows = [{ id: "trigger-1" }]
    const offsetFn = vi.fn().mockResolvedValue(rows)
    mocks.selectWhere.limit.mockReturnValue({ offset: offsetFn })
    const countBuilder = { where: vi.fn().mockResolvedValue([{ count: 1 }]) }
    mocks.select
      .mockReturnValueOnce({
        from: vi.fn(() => ({ where: vi.fn(() => mocks.selectWhere) })),
      })
      .mockReturnValueOnce({
        from: vi.fn(() => countBuilder),
      })

    const result = await triggerRepository.listPaginated({
      workspaceId: "ws-1",
      folderId: "",
      limit: 10,
      offset: 0,
    })

    expect(result.rows).toEqual(rows)
    expect(result.total).toBe(1)
  })
})

describe("triggerRepository.findWithConditions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns null when neither id nor workspaceId is provided", async () => {
    const result = await triggerRepository.findWithConditions({})
    expect(result).toBeNull()
    expect(mocks.findFirst).not.toHaveBeenCalled()
  })

  test("queries with conditions included when id is provided", async () => {
    mocks.findFirst.mockResolvedValue({ id: "trigger-1", conditions: [] })

    const result = await triggerRepository.findWithConditions({
      id: "trigger-1",
    })

    expect(result).toEqual({ id: "trigger-1", conditions: [] })
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "trigger-1" },
        with: { conditions: true },
      }),
    )
  })

  test("returns null when no row matches", async () => {
    mocks.findFirst.mockResolvedValue(undefined)

    const result = await triggerRepository.findWithConditions({
      workspaceId: "ws-1",
    })

    expect(result).toBeNull()
  })
})
