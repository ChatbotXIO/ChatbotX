import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  fieldFindFirst: vi.fn(),
  fieldInsert: vi.fn(),
  fieldInsertValues: vi.fn(),
  fieldInsertReturning: vi.fn(),
  fieldUpdate: vi.fn(),
  fieldUpdateSet: vi.fn(),
  fieldUpdateWhere: vi.fn(),
  fieldUpdateReturning: vi.fn(),
  invalidateCacheByTags: vi.fn(),
  folderEnsureExists: vi.fn(),
  createId: vi.fn(() => "generated-id"),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      customFieldModel: {
        findFirst: mocks.fieldFindFirst,
      },
    },
    insert: mocks.fieldInsert,
    update: mocks.fieldUpdate,
  },
  and: (...args: unknown[]) => args,
  eq: (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  rootFolderId: "root",
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  customFieldModel: { id: "customFieldModel" },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  likeContains: vi.fn((value: string) => `%${value}%`),
  parseOrderByAsObject: vi.fn(() => ({})),
  parsePagination: vi.fn(() => null),
}))

vi.mock("@chatbotx.io/redis", () => ({
  withCache: vi.fn(async (_key: string, resolver: () => unknown) => resolver()),
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mocks.createId,
  isNumericId: vi.fn(() => false),
}))

vi.mock("@chatbotx.io/utils/custom-field", () => ({
  customFieldResolutionKey: vi.fn(
    (field: { name: string; type: string }) => `${field.type}:${field.name}`,
  ),
}))

vi.mock("../../folder/service", () => ({
  folderService: {
    ensureExists: mocks.folderEnsureExists,
  },
}))

const { customFieldService } = await import("../service")
const { ChatbotXException } = await import("../../errors")

const WS = "ws-test-1"

function wireInsertChain() {
  const chain = {
    values: mocks.fieldInsertValues.mockReturnThis(),
    returning: mocks.fieldInsertReturning,
  }
  mocks.fieldInsert.mockReturnValue(chain)
}

function wireUpdateChain() {
  const chain = {
    set: mocks.fieldUpdateSet.mockReturnThis(),
    where: mocks.fieldUpdateWhere.mockReturnThis(),
    returning: mocks.fieldUpdateReturning,
  }
  mocks.fieldUpdate.mockReturnValue(chain)
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createId.mockReturnValue("generated-id")
  wireInsertChain()
  wireUpdateChain()
})

describe("CustomFieldService.create", () => {
  test("throws nameTaken ChatbotXException when workspaceId+type+name already exists", async () => {
    mocks.fieldFindFirst.mockResolvedValueOnce({ id: "existing-id" })

    await expect(
      customFieldService.create({
        workspaceId: WS,
        data: { name: "Phone", type: "shortText" },
      }),
    ).rejects.toMatchObject({ code: "nameTaken", httpStatusCode: 400 })

    expect(mocks.fieldInsert).not.toHaveBeenCalled()
  })

  test("rejects with a real ChatbotXException instance", async () => {
    mocks.fieldFindFirst.mockResolvedValueOnce({ id: "existing-id" })

    await expect(
      customFieldService.create({
        workspaceId: WS,
        data: { name: "Phone", type: "shortText" },
      }),
    ).rejects.toBeInstanceOf(ChatbotXException)
  })

  test("creates the field when no duplicate exists", async () => {
    mocks.fieldFindFirst.mockResolvedValueOnce(undefined)
    mocks.fieldInsertReturning.mockResolvedValueOnce([
      { id: "field-1", name: "Phone", type: "shortText", workspaceId: WS },
    ])

    const result = await customFieldService.create({
      workspaceId: WS,
      data: { name: "Phone", type: "shortText" },
    })

    expect(result).toEqual({
      id: "field-1",
      name: "Phone",
      type: "shortText",
      workspaceId: WS,
    })
    expect(mocks.folderEnsureExists).not.toHaveBeenCalled()
  })

  test("calls folderService.ensureExists with folderType 'customField' when folderId provided", async () => {
    mocks.fieldFindFirst.mockResolvedValueOnce(undefined)
    mocks.fieldInsertReturning.mockResolvedValueOnce([
      { id: "field-2", name: "Region", type: "shortText", workspaceId: WS },
    ])

    await customFieldService.create({
      workspaceId: WS,
      data: { name: "Region", type: "shortText", folderId: "10" },
    })

    expect(mocks.folderEnsureExists).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "10",
        workspaceId: WS,
        folderType: "customField",
      }),
    )
  })
})

describe("CustomFieldService.update", () => {
  test("throws nameTaken ChatbotXException when another field of the same type has the same name", async () => {
    mocks.fieldFindFirst
      // findByKeyOrFail -> findByKey lookup for the existing field itself
      .mockResolvedValueOnce({
        id: "field-1",
        type: "shortText",
        folderId: null,
      })
      // duplicate-name lookup
      .mockResolvedValueOnce({ id: "field-2" })

    await expect(
      customFieldService.update(
        { workspaceId: WS, id: "field-1" },
        {
          name: "Taken",
        },
      ),
    ).rejects.toMatchObject({ code: "nameTaken", httpStatusCode: 400 })

    expect(mocks.fieldUpdate).not.toHaveBeenCalled()
  })

  test("updates when no duplicate name exists", async () => {
    mocks.fieldFindFirst
      .mockResolvedValueOnce({
        id: "field-1",
        type: "shortText",
        folderId: null,
      })
      .mockResolvedValueOnce(undefined)
    mocks.fieldUpdateReturning.mockResolvedValueOnce([
      { id: "field-1", name: "Renamed", type: "shortText", workspaceId: WS },
    ])

    const result = await customFieldService.update(
      { workspaceId: WS, id: "field-1" },
      { name: "Renamed" },
    )

    expect(result).toEqual({
      id: "field-1",
      name: "Renamed",
      type: "shortText",
      workspaceId: WS,
    })
  })

  test("does not check for duplicates when name is not part of the update", async () => {
    mocks.fieldFindFirst.mockResolvedValueOnce({
      id: "field-1",
      type: "shortText",
      folderId: null,
    })
    mocks.fieldUpdateReturning.mockResolvedValueOnce([
      { id: "field-1", name: "Existing", type: "shortText", workspaceId: WS },
    ])

    await customFieldService.update(
      { workspaceId: WS, id: "field-1" },
      { description: "New description" },
    )

    expect(mocks.fieldFindFirst).toHaveBeenCalledTimes(1)
  })
})
