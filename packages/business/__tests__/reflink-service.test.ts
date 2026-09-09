import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockInsert,
  mockInsertValues,
  mockUpdate,
  mockUpdateSet,
  mockUpdateWhere,
  mockListPaginated,
  mockCount,
  mockFindByIdAndWorkspace,
  mockIsUniqueViolationError,
} = vi.hoisted(() => {
  const mockInsertValues = vi.fn()
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  const mockUpdateWhere = vi.fn()
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }))

  return {
    mockInsert,
    mockInsertValues,
    mockUpdate,
    mockUpdateSet,
    mockUpdateWhere,
    mockListPaginated: vi.fn(),
    mockCount: vi.fn(),
    mockFindByIdAndWorkspace: vi.fn(),
    mockIsUniqueViolationError: vi.fn(() => false),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: { insert: mockInsert, update: mockUpdate },
  and: (...args: unknown[]) => ({ __and: args }),
  desc: vi.fn(),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  inArray: (a: unknown, b: unknown) => ({ __inArray: [a, b] }),
  isUniqueViolationError: mockIsUniqueViolationError,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  reflinkRepository: {
    listPaginated: mockListPaginated,
    count: mockCount,
    findByIdAndWorkspace: mockFindByIdAndWorkspace,
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  reflinkModel: {
    id: "reflink.id",
    workspaceId: "reflink.workspaceId",
    type: "reflink.type",
    name: "reflink.name",
    createdAt: "reflink.createdAt",
  },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: vi.fn(() => "generated-id"),
}))

vi.mock("../src/template/installed-resource.service", () => ({
  assertDeletable: vi.fn().mockResolvedValue(undefined),
}))

const { reflinkService } = await import("../src/reflink/service")

const WS = "ws-1"

afterEach(() => {
  vi.clearAllMocks()
})

describe("reflinkService.list", () => {
  test("paginates via the repository and computes pageCount", async () => {
    mockListPaginated.mockResolvedValueOnce([{ id: "reflink-1" }])
    mockCount.mockResolvedValueOnce(5)

    const result = await reflinkService.list({
      workspaceId: WS,
      page: 1,
      perPage: 2,
    })

    expect(result).toEqual({ data: [{ id: "reflink-1" }], pageCount: 3 })
    expect(mockListPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS }),
    )
  })
})

describe("reflinkService.findOrFail", () => {
  test("returns the row when found", async () => {
    mockFindByIdAndWorkspace.mockResolvedValueOnce({ id: "reflink-1" })

    const result = await reflinkService.findOrFail({
      workspaceId: WS,
      id: "reflink-1",
    })

    expect(result).toEqual({ id: "reflink-1" })
  })

  test("throws not found when no row matches", async () => {
    mockFindByIdAndWorkspace.mockResolvedValueOnce(undefined)

    await expect(
      reflinkService.findOrFail({ workspaceId: WS, id: "missing" }),
    ).rejects.toThrow("Reflink not found")
  })
})

describe("reflinkService.create", () => {
  test("inserts scoped to the workspace with type=refLink", async () => {
    const created = { id: "reflink-1", name: "Summer promo" }
    mockInsertValues.mockReturnValueOnce({
      returning: vi.fn().mockResolvedValueOnce([created]),
    })

    const result = await reflinkService.create({
      workspaceId: WS,
      data: { name: "Summer promo", flowId: "flow-1" },
    })

    expect(result).toEqual(created)
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS,
        type: "refLink",
        name: "Summer promo",
        flowId: "flow-1",
      }),
    )
  })

  test("maps a unique-violation on name into a field-scoped validation error", async () => {
    mockIsUniqueViolationError.mockReturnValueOnce(true)
    mockInsertValues.mockReturnValueOnce({
      returning: vi.fn().mockRejectedValueOnce(new Error("duplicate key")),
    })

    await expect(
      reflinkService.create({
        workspaceId: WS,
        data: { name: "Summer promo", flowId: "flow-1" },
      }),
    ).rejects.toThrow("Name is already taken")
  })
})

describe("reflinkService.update", () => {
  test("verifies existence then updates", async () => {
    mockFindByIdAndWorkspace.mockResolvedValueOnce({
      id: "reflink-1",
      name: "Old name",
    })
    const updated = { id: "reflink-1", name: "New name" }
    mockUpdateWhere.mockReturnValueOnce({
      returning: vi.fn().mockResolvedValueOnce([updated]),
    })

    const result = await reflinkService.update(
      { workspaceId: WS, id: "reflink-1" },
      { name: "New name" },
    )

    expect(result).toEqual(updated)
    expect(mockUpdateSet).toHaveBeenCalledWith({ name: "New name" })
  })

  test("throws not found before updating when the row does not exist", async () => {
    mockFindByIdAndWorkspace.mockResolvedValueOnce(undefined)

    await expect(
      reflinkService.update({ workspaceId: WS, id: "missing" }, { name: "x" }),
    ).rejects.toThrow("Reflink not found")

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  test("maps a unique-violation on name into a field-scoped validation error", async () => {
    mockFindByIdAndWorkspace.mockResolvedValueOnce({
      id: "reflink-1",
      name: "Old name",
    })
    mockIsUniqueViolationError.mockReturnValueOnce(true)
    mockUpdateWhere.mockReturnValueOnce({
      returning: vi.fn().mockRejectedValueOnce(new Error("duplicate key")),
    })

    await expect(
      reflinkService.update(
        { workspaceId: WS, id: "reflink-1" },
        { name: "Taken name" },
      ),
    ).rejects.toThrow("Name is already taken")
  })
})
