// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  $count: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  db: {
    query: {
      triggerModel: { findFirst: mocks.findFirst, findMany: mocks.findMany },
    },
    $count: mocks.$count,
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

describe("triggerRepository.listPaginatedWithConditions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("resolves an empty-string folderId to isNull (trigger sentinel, not rootFolderId)", async () => {
    const rows = [{ id: "trigger-1", conditions: [] }]
    mocks.findMany.mockResolvedValue(rows)
    mocks.$count.mockResolvedValue(1)

    const result = await triggerRepository.listPaginatedWithConditions({
      workspaceId: "ws-1",
      folderId: "",
      limit: 10,
      offset: 0,
    })

    expect(result.rows).toEqual(rows)
    expect(result.total).toBe(1)
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "ws-1",
          folderId: { isNull: true },
        }),
        with: { conditions: true },
      }),
    )
  })

  test("filters by folderId and name when provided", async () => {
    mocks.findMany.mockResolvedValue([])
    mocks.$count.mockResolvedValue(0)

    await triggerRepository.listPaginatedWithConditions({
      workspaceId: "ws-1",
      folderId: "folder-1",
      name: "Welcome",
      limit: 10,
      offset: 0,
    })

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "ws-1",
          folderId: "folder-1",
          name: "Welcome",
        }),
      }),
    )
  })

  test("omits folderId/name filters entirely when not provided", async () => {
    mocks.findMany.mockResolvedValue([])
    mocks.$count.mockResolvedValue(0)

    await triggerRepository.listPaginatedWithConditions({
      workspaceId: "ws-1",
      limit: 10,
      offset: 0,
    })

    const call = mocks.findMany.mock.calls[0]?.[0]
    expect(call.where).not.toHaveProperty("folderId")
    expect(call.where).not.toHaveProperty("name")
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
