import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  insertValues: vi.fn(),
  insert: vi.fn(),
  findOrFail: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: mocks.insert,
    query: { spreadsheetModel: { findMany: mocks.findMany } },
    $count: mocks.count,
  },
  findOrFail: mocks.findOrFail,
  relationsFilterToSQL: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  spreadsheetModel: { name: "spreadsheet.name" },
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  parsePagination: (input: { page?: number; perPage?: number }) =>
    input.perPage
      ? {
          limit: input.perPage,
          offset: ((input.page ?? 1) - 1) * input.perPage,
        }
      : null,
}))

let nextId = 0
vi.mock("@chatbotx.io/utils", () => ({
  createId: () => `id-${nextId++}`,
}))

const { spreadsheetService } = await import("../src/spreadsheet/service")

beforeEach(() => {
  vi.clearAllMocks()
  mocks.insert.mockReturnValue({ values: mocks.insertValues })
  mocks.insertValues.mockResolvedValue(undefined)
  mocks.findMany.mockResolvedValue([])
  mocks.count.mockResolvedValue(0)
})

describe("spreadsheetService.create", () => {
  test("inserts with the given workspaceId and spreadsheetId", async () => {
    await spreadsheetService.create({
      workspaceId: "ws-1",
      spreadsheetId: "sheet-abc",
      data: { url: "https://docs.google.com/x", name: "My sheet" },
    })

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        spreadsheetId: "sheet-abc",
        url: "https://docs.google.com/x",
      }),
    )
  })
})

describe("spreadsheetService.list — unlimited pagination", () => {
  test("pageCount is 1 and totalRows is not counted when perPage is absent", async () => {
    mocks.findMany.mockResolvedValue([{ id: "s-1" }, { id: "s-2" }])

    const result = await spreadsheetService.list({ workspaceId: "ws-1" })

    expect(result.pageCount).toBe(1)
    expect(mocks.count).not.toHaveBeenCalled()
  })

  test("paginates and counts when perPage is given", async () => {
    mocks.findMany.mockResolvedValue([{ id: "s-1" }])
    mocks.count.mockResolvedValue(25)

    const result = await spreadsheetService.list({
      workspaceId: "ws-1",
      page: 1,
      perPage: 10,
    })

    expect(result.pageCount).toBe(3)
    expect(mocks.count).toHaveBeenCalled()
  })
})
