// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockCreateId,
  mockDb,
  mockFindMany,
  mockInsert,
  mockInsertValues,
  mockReturning,
  mockInvalidateCacheTags,
} = vi.hoisted(() => {
  const mockReturning = vi.fn()
  const mockOnConflictDoNothing = vi.fn(() => ({ returning: mockReturning }))
  const mockInsertValues = vi.fn(() => ({
    onConflictDoNothing: mockOnConflictDoNothing,
  }))
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))
  const mockFindMany = vi.fn()

  return {
    mockCreateId: vi.fn(),
    mockDb: {
      query: { customFieldModel: { findMany: mockFindMany } },
      insert: mockInsert,
    },
    mockFindMany,
    mockInsert,
    mockInsertValues,
    mockReturning,
    mockInvalidateCacheTags: vi.fn(),
  }
})

const customFieldModel = { table: "CustomField" }
const NUMERIC_ID_PATTERN = /^\d+$/

vi.mock("@chatbotx.io/database/client", () => ({
  db: mockDb,
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  rootFolderId: "root",
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  customFieldModel,
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  likeContains: vi.fn(),
  parseOrderByAsObject: vi.fn(),
  parsePagination: vi.fn(),
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: (_key: string, fn: () => unknown) => fn(),
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mockCreateId,
  isNumericId: (value: string) => NUMERIC_ID_PATTERN.test(value),
}))

vi.mock("../src/base.service", () => ({
  BaseService: class BaseService {
    invalidateCacheTags(...args: unknown[]) {
      return mockInvalidateCacheTags(...args)
    }
  },
}))

vi.mock("../src/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

vi.mock("../src/folder/service", () => ({
  folderService: { ensureExists: vi.fn() },
}))

const { customFieldService } = await import("../src/custom-field/service")

describe("customFieldService.resolveByNameAndType", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("disambiguates the same name across different types", async () => {
    mockFindMany.mockResolvedValue([
      { id: "1", workspaceId: "ws-1", name: "Birthday", type: "date" },
      { id: "2", workspaceId: "ws-1", name: "Birthday", type: "shortText" },
    ])

    const { idMap, createdIds } = await customFieldService.resolveByNameAndType(
      {
        workspaceId: "ws-1",
        fields: [
          { name: "Birthday", type: "date" },
          { name: "Birthday", type: "shortText" },
        ],
      },
    )

    expect(idMap.get("date:birthday")).toBe("1")
    expect(idMap.get("shortText:birthday")).toBe("2")
    expect(createdIds).toEqual([])
    expect(mockInsert).not.toHaveBeenCalled()
  })

  test("matches case-insensitively without creating a duplicate", async () => {
    mockFindMany.mockResolvedValue([
      { id: "1", workspaceId: "ws-1", name: "Birthday", type: "date" },
    ])

    const { idMap, createdIds } = await customFieldService.resolveByNameAndType(
      {
        workspaceId: "ws-1",
        fields: [{ name: "birthday", type: "date" }],
      },
    )

    expect(idMap.get("date:birthday")).toBe("1")
    expect(createdIds).toEqual([])
    expect(mockInsert).not.toHaveBeenCalled()
  })

  test("creates a field with the manifest's type when no match exists", async () => {
    mockFindMany.mockResolvedValue([])
    mockCreateId.mockReturnValue("new-id-1")
    mockReturning.mockResolvedValue([
      {
        id: "new-id-1",
        workspaceId: "ws-1",
        name: "Favorite Color",
        type: "shortText",
      },
    ])

    const { idMap, createdIds } = await customFieldService.resolveByNameAndType(
      {
        workspaceId: "ws-1",
        fields: [{ name: "Favorite Color", type: "shortText" }],
      },
    )

    expect(idMap.get("shortText:favorite color")).toBe("new-id-1")
    expect(createdIds).toEqual(["new-id-1"])
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockInsertValues).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "new-id-1",
        workspaceId: "ws-1",
        name: "Favorite Color",
        type: "shortText",
      }),
    ])
  })

  test("creates a second field when the same name exists under a different type", async () => {
    mockFindMany.mockResolvedValue([
      { id: "1", workspaceId: "ws-1", name: "Birthday", type: "date" },
    ])
    mockCreateId.mockReturnValue("new-id-2")
    mockReturning.mockResolvedValue([
      {
        id: "new-id-2",
        workspaceId: "ws-1",
        name: "Birthday",
        type: "shortText",
      },
    ])

    const { idMap, createdIds } = await customFieldService.resolveByNameAndType(
      {
        workspaceId: "ws-1",
        fields: [{ name: "Birthday", type: "shortText" }],
      },
    )

    expect(idMap.get("shortText:birthday")).toBe("new-id-2")
    expect(createdIds).toEqual(["new-id-2"])
  })

  test("batches all missing fields into a single insert call", async () => {
    mockFindMany.mockResolvedValue([])
    mockCreateId
      .mockReturnValueOnce("new-1")
      .mockReturnValueOnce("new-2")
      .mockReturnValueOnce("new-3")
    mockReturning.mockResolvedValue([
      { id: "new-1", workspaceId: "ws-1", name: "Alpha", type: "shortText" },
      { id: "new-2", workspaceId: "ws-1", name: "Beta", type: "shortText" },
      { id: "new-3", workspaceId: "ws-1", name: "Gamma", type: "shortText" },
    ])

    const { idMap, createdIds } = await customFieldService.resolveByNameAndType(
      {
        workspaceId: "ws-1",
        fields: [
          { name: "Alpha", type: "shortText" },
          { name: "Beta", type: "shortText" },
          { name: "Gamma", type: "shortText" },
        ],
      },
    )

    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockInsertValues).toHaveBeenCalledWith([
      expect.objectContaining({ id: "new-1", name: "Alpha" }),
      expect.objectContaining({ id: "new-2", name: "Beta" }),
      expect.objectContaining({ id: "new-3", name: "Gamma" }),
    ])
    expect(createdIds.sort()).toEqual(["new-1", "new-2", "new-3"])
    expect(idMap.get("shortText:alpha")).toBe("new-1")
    expect(idMap.get("shortText:beta")).toBe("new-2")
    expect(idMap.get("shortText:gamma")).toBe("new-3")
    expect(mockFindMany).toHaveBeenCalledTimes(1)
  })

  test("partial conflict within a batch: landed rows resolve directly, the lost one re-selects", async () => {
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "winner-id",
        workspaceId: "ws-1",
        name: "Beta",
        type: "shortText",
      },
    ])
    mockCreateId
      .mockReturnValueOnce("new-1")
      .mockReturnValueOnce("loser-id")
      .mockReturnValueOnce("new-3")
    // Beta's insert lost the onConflictDoNothing race, so only 2 of the 3
    // attempted rows come back from returning().
    mockReturning.mockResolvedValue([
      { id: "new-1", workspaceId: "ws-1", name: "Alpha", type: "shortText" },
      { id: "new-3", workspaceId: "ws-1", name: "Gamma", type: "shortText" },
    ])

    const { idMap, createdIds } = await customFieldService.resolveByNameAndType(
      {
        workspaceId: "ws-1",
        fields: [
          { name: "Alpha", type: "shortText" },
          { name: "Beta", type: "shortText" },
          { name: "Gamma", type: "shortText" },
        ],
      },
    )

    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(createdIds.sort()).toEqual(["new-1", "new-3"])
    expect(createdIds).not.toContain("winner-id")
    expect(idMap.get("shortText:alpha")).toBe("new-1")
    expect(idMap.get("shortText:beta")).toBe("winner-id")
    expect(idMap.get("shortText:gamma")).toBe("new-3")
    expect(mockFindMany).toHaveBeenCalledTimes(2)
  })

  test("concurrent resolve: a lost onConflictDoNothing race re-selects the winner's row", async () => {
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "winner-id",
        workspaceId: "ws-1",
        name: "Birthday",
        type: "date",
      },
    ])
    mockCreateId.mockReturnValue("loser-id")
    // onConflictDoNothing + returning() resolves to an empty array when a
    // concurrent insert won the race first.
    mockReturning.mockResolvedValue([])

    const { idMap, createdIds } = await customFieldService.resolveByNameAndType(
      {
        workspaceId: "ws-1",
        fields: [{ name: "Birthday", type: "date" }],
      },
    )

    expect(idMap.get("date:birthday")).toBe("winner-id")
    expect(createdIds).toEqual([])
    expect(mockFindMany).toHaveBeenCalledTimes(2)
  })

  test("returns an empty result for an empty fields list without querying", async () => {
    const { idMap, createdIds } = await customFieldService.resolveByNameAndType(
      {
        workspaceId: "ws-1",
        fields: [],
      },
    )

    expect(idMap.size).toBe(0)
    expect(createdIds).toEqual([])
    expect(mockFindMany).not.toHaveBeenCalled()
  })
})

describe("customFieldService.findManyByIds", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("scopes the lookup by workspaceId alongside the id list", async () => {
    mockFindMany.mockResolvedValue([
      { id: "1", workspaceId: "ws-1", name: "Birthday", type: "date" },
    ])

    const rows = await customFieldService.findManyByIds({
      workspaceId: "ws-1",
      ids: ["1", "2"],
    })

    expect(rows).toEqual([
      { id: "1", workspaceId: "ws-1", name: "Birthday", type: "date" },
    ])
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", id: { in: ["1", "2"] } },
    })
  })

  test("returns an empty array for an empty id list without querying", async () => {
    const rows = await customFieldService.findManyByIds({
      workspaceId: "ws-1",
      ids: [],
    })

    expect(rows).toEqual([])
    expect(mockFindMany).not.toHaveBeenCalled()
  })
})
