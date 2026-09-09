// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      flowModel: {
        findMany: mocks.findMany,
        findFirst: mocks.findFirst,
      },
    },
    $count: mocks.count,
  },
  relationsFilterToSQL: vi.fn(() => "sql-filter"),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  rootFolderId: "0",
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  flowModel: { name: "flowModel.name" },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  likeContains: vi.fn((value: string) => `%${value}%`),
  parseOrderByAsObject: vi.fn(() => ({})),
  parsePagination: vi.fn(() => ({ limit: 10, offset: 0 })),
}))

const { flowRepository } = await import("../src/repositories/flow/repository")

describe("flowRepository.listWithVersions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("scopes the query to the workspace and attaches draft+latest versions", async () => {
    mocks.findMany.mockResolvedValue([{ id: "flow-1" }])

    const result = await flowRepository.listWithVersions({
      workspaceId: "ws-1",
    })

    expect(result).toEqual([{ id: "flow-1" }])
    const call = mocks.findMany.mock.calls[0]?.[0] as {
      where: { workspaceId: string }
      with: { flowVersions: { where: { OR: unknown[] } } }
    }
    expect(call.where.workspaceId).toBe("ws-1")
    expect(call.with.flowVersions.where.OR).toEqual([
      { isDraft: true },
      { isLatest: true },
    ])
  })

  test("resolves the root-folder sentinel to isNull", async () => {
    mocks.findMany.mockResolvedValue([])

    await flowRepository.listWithVersions({
      workspaceId: "ws-1",
      folderId: "0",
    })

    const call = mocks.findMany.mock.calls[0]?.[0] as {
      where: { folderId: unknown }
    }
    expect(call.where.folderId).toEqual({ isNull: true })
  })
})

describe("flowRepository.count", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("delegates to db.$count with the same where shape", async () => {
    mocks.count.mockResolvedValue(5)

    const result = await flowRepository.count({ workspaceId: "ws-1" })

    expect(result).toBe(5)
    expect(mocks.count).toHaveBeenCalled()
  })
})

describe("flowRepository.findWithVersions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("scopes by both id and workspaceId", async () => {
    mocks.findFirst.mockResolvedValue({ id: "flow-1" })

    const result = await flowRepository.findWithVersions({
      workspaceId: "ws-1",
      id: "flow-1",
    })

    expect(result).toEqual({ id: "flow-1" })
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "ws-1", id: "flow-1" },
        with: { flowVersions: true },
      }),
    )
  })
})

describe("flowRepository.listIdsByIds", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("returns only the ids that exist in the workspace", async () => {
    mocks.findMany.mockResolvedValue([{ id: "flow-1" }, { id: "flow-2" }])

    const result = await flowRepository.listIdsByIds({
      workspaceId: "ws-1",
      ids: ["flow-1", "flow-2", "flow-missing"],
    })

    expect(result).toEqual(["flow-1", "flow-2"])
  })
})
