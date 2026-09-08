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
      aiTriggerModel: {
        findMany: mocks.findMany,
        findFirst: mocks.findFirst,
      },
    },
    $count: mocks.$count,
  },
  relationsFilterToSQL: vi.fn((_model: unknown, where: unknown) => where),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  aiTriggerModel: { id: "id-col", workspaceId: "workspaceId-col" },
}))

const { aiTriggerRepository } = await import(
  "../src/repositories/ai-trigger/repository"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("aiTriggerRepository.listPaginated", () => {
  test("scopes the query by workspaceId with pagination defaults", async () => {
    const rows = [{ id: "ai-trigger-1" }]
    mocks.findMany.mockResolvedValueOnce(rows)

    const result = await aiTriggerRepository.listPaginated({
      workspaceId: "ws-1",
      page: 1,
      perPage: 50,
    })

    expect(result).toEqual(rows)
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: "ws-1" }),
      }),
    )
  })

  test("filters by name using a contains-style ilike when given", async () => {
    mocks.findMany.mockResolvedValueOnce([])

    await aiTriggerRepository.listPaginated({
      workspaceId: "ws-1",
      name: "support",
      page: 1,
      perPage: 50,
    })

    const where = mocks.findMany.mock.calls[0]?.[0]?.where
    expect(where.name).toEqual({ ilike: "%support%" })
  })
})

describe("aiTriggerRepository.count", () => {
  test("counts rows scoped to the workspace", async () => {
    mocks.$count.mockResolvedValueOnce(3)

    const result = await aiTriggerRepository.count({ workspaceId: "ws-1" })

    expect(result).toBe(3)
    expect(mocks.$count).toHaveBeenCalledWith(
      { id: "id-col", workspaceId: "workspaceId-col" },
      expect.objectContaining({ workspaceId: "ws-1" }),
    )
  })
})

describe("aiTriggerRepository.findByIdAndWorkspace", () => {
  test("scopes the lookup by both id and workspaceId", async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: "ai-trigger-1" })

    const result = await aiTriggerRepository.findByIdAndWorkspace({
      id: "ai-trigger-1",
      workspaceId: "ws-1",
    })

    expect(result).toEqual({ id: "ai-trigger-1" })
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "ai-trigger-1", workspaceId: "ws-1" },
    })
  })

  test("returns undefined when no row matches", async () => {
    mocks.findFirst.mockResolvedValueOnce(undefined)

    const result = await aiTriggerRepository.findByIdAndWorkspace({
      id: "missing",
      workspaceId: "ws-1",
    })

    expect(result).toBeUndefined()
  })
})
