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
      query: { botFieldModel: { findMany: mockFindMany } },
      insert: mockInsert,
    },
    mockFindMany,
    mockInsert,
    mockInsertValues,
    mockReturning,
    mockInvalidateCacheTags: vi.fn(),
  }
})

const botFieldModel = { table: "BotField" }

vi.mock("@chatbotx.io/database/client", () => ({
  db: mockDb,
  and: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  relationsFilterToSQL: vi.fn(),
  sql: vi.fn(),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  rootFolderId: "root",
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  botFieldModel,
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  likeContains: vi.fn(),
  parseOrderByAsObject: vi.fn(),
  parsePagination: vi.fn(),
}))

vi.mock("@chatbotx.io/flow-config", () => ({
  FieldOperationType: {
    set: "set",
    append: "append",
    prepend: "prepend",
    increase: "increase",
    decrease: "decrease",
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: (_key: string, fn: () => unknown) => fn(),
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mockCreateId,
}))

vi.mock("@chatbotx.io/utils/custom-field", () => ({
  customFieldResolutionKey: (field: { name: string; type: string }) =>
    `${field.type}:${field.name.trim().toLowerCase()}`,
}))

vi.mock("@chatbotx.io/utils/datetime", () => ({
  SourceTimezoneStrategy: { Workspace: "workspace" },
}))

vi.mock("../src/base.service", () => ({
  BaseService: class BaseService {
    invalidateCacheTags(...args: unknown[]) {
      return mockInvalidateCacheTags(...args)
    }
  },
}))

vi.mock("../src/contact-custom-field/normalize", () => ({
  createSourceTimezoneResolver: vi.fn(),
  normalizeCustomFieldValueForStorage: vi.fn(),
}))

// This suite doesn't exercise value normalization, so mock away the (real)
// module the same way `contact-custom-field/normalize` is mocked above —
// otherwise it would pull in `@chatbotx.io/utils/temporal-input`, which needs
// more of the real `@chatbotx.io/utils/datetime` than this file mocks.
vi.mock("../src/javascript-execution/custom-field-value", () => ({
  normalizeNumber: vi.fn(),
}))

vi.mock("../src/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {},
  notFoundException: (message: string) => new Error(message),
}))

vi.mock("../src/folder/service", () => ({
  folderService: { ensureExists: vi.fn() },
}))

vi.mock("../src/template/installed-resource.service", () => ({
  assertDeletable: vi.fn(),
}))

const { botFieldService } = await import("../src/bot-field/service")

describe("botFieldService.resolveByNameAndType", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("disambiguates the same name across different types", async () => {
    mockFindMany.mockResolvedValue([
      { id: "1", workspaceId: "ws-1", name: "Loyalty Points", type: "number" },
      {
        id: "2",
        workspaceId: "ws-1",
        name: "Loyalty Points",
        type: "shortText",
      },
    ])

    const { idMap, createdIds } = await botFieldService.resolveByNameAndType({
      workspaceId: "ws-1",
      fields: [
        { name: "Loyalty Points", type: "number" },
        { name: "Loyalty Points", type: "shortText" },
      ],
    })

    expect(idMap.get("number:loyalty points")).toBe("1")
    expect(idMap.get("shortText:loyalty points")).toBe("2")
    expect(createdIds).toEqual([])
    expect(mockInsert).not.toHaveBeenCalled()
  })

  test("matches case-insensitively without creating a duplicate", async () => {
    mockFindMany.mockResolvedValue([
      { id: "1", workspaceId: "ws-1", name: "Loyalty Points", type: "number" },
    ])

    const { idMap, createdIds } = await botFieldService.resolveByNameAndType({
      workspaceId: "ws-1",
      fields: [{ name: "loyalty points", type: "number" }],
    })

    expect(idMap.get("number:loyalty points")).toBe("1")
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

    const { idMap, createdIds } = await botFieldService.resolveByNameAndType({
      workspaceId: "ws-1",
      fields: [{ name: "Favorite Color", type: "shortText" }],
    })

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

    const { idMap, createdIds } = await botFieldService.resolveByNameAndType({
      workspaceId: "ws-1",
      fields: [
        { name: "Alpha", type: "shortText" },
        { name: "Beta", type: "shortText" },
        { name: "Gamma", type: "shortText" },
      ],
    })

    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(createdIds.sort()).toEqual(["new-1", "new-2", "new-3"])
    expect(idMap.get("shortText:alpha")).toBe("new-1")
    expect(idMap.get("shortText:beta")).toBe("new-2")
    expect(idMap.get("shortText:gamma")).toBe("new-3")
    expect(mockFindMany).toHaveBeenCalledTimes(1)
  })

  test("concurrent resolve: a lost onConflictDoNothing race re-selects the winner's row", async () => {
    mockFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "winner-id",
        workspaceId: "ws-1",
        name: "Loyalty Points",
        type: "number",
      },
    ])
    mockCreateId.mockReturnValue("loser-id")
    // onConflictDoNothing + returning() resolves to an empty array when a
    // concurrent insert won the race first.
    mockReturning.mockResolvedValue([])

    const { idMap, createdIds } = await botFieldService.resolveByNameAndType({
      workspaceId: "ws-1",
      fields: [{ name: "Loyalty Points", type: "number" }],
    })

    expect(idMap.get("number:loyalty points")).toBe("winner-id")
    expect(createdIds).toEqual([])
    expect(mockFindMany).toHaveBeenCalledTimes(2)
  })

  test("returns an empty result for an empty fields list without querying", async () => {
    const { idMap, createdIds } = await botFieldService.resolveByNameAndType({
      workspaceId: "ws-1",
      fields: [],
    })

    expect(idMap.size).toBe(0)
    expect(createdIds).toEqual([])
    expect(mockFindMany).not.toHaveBeenCalled()
  })
})

describe("botFieldService.findManyByIds", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("scopes the lookup by workspaceId alongside the id list", async () => {
    mockFindMany.mockResolvedValue([
      { id: "1", workspaceId: "ws-1", name: "Loyalty Points", type: "number" },
    ])

    const rows = await botFieldService.findManyByIds({
      workspaceId: "ws-1",
      ids: ["1", "2"],
    })

    expect(rows).toEqual([
      { id: "1", workspaceId: "ws-1", name: "Loyalty Points", type: "number" },
    ])
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { workspaceId: "ws-1", id: { in: ["1", "2"] } },
    })
  })

  test("returns an empty array for an empty id list without querying", async () => {
    const rows = await botFieldService.findManyByIds({
      workspaceId: "ws-1",
      ids: [],
    })

    expect(rows).toEqual([])
    expect(mockFindMany).not.toHaveBeenCalled()
  })
})
