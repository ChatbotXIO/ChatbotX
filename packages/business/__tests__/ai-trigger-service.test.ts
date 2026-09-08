import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockInsert,
  mockInsertValues,
  mockUpdate,
  mockUpdateSet,
  mockUpdateWhere,
  mockDelete,
  mockFindMany,
  mockDispatchAuditRecord,
  mockListPaginated,
  mockCount,
  mockFindByIdAndWorkspace,
} = vi.hoisted(() => {
  const mockInsertReturning = vi.fn()
  const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }))
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  const mockUpdateReturning = vi.fn()
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }))
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }))

  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined)
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))

  return {
    mockInsert,
    mockInsertValues,
    mockInsertReturning,
    mockUpdate,
    mockUpdateSet,
    mockUpdateWhere,
    mockUpdateReturning,
    mockDelete,
    mockDeleteWhere,
    mockFindMany: vi.fn(),
    mockDispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
    mockListPaginated: vi.fn(),
    mockCount: vi.fn(),
    mockFindByIdAndWorkspace: vi.fn(),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    query: { aiTriggerModel: { findMany: mockFindMany } },
  },
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  inArray: (a: unknown, b: unknown) => ({ __inArray: [a, b] }),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  aiTriggerRepository: {
    listPaginated: mockListPaginated,
    count: mockCount,
    findByIdAndWorkspace: mockFindByIdAndWorkspace,
  },
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  aiTriggerModel: { id: "aiTrigger.id", workspaceId: "aiTrigger.workspaceId" },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: vi.fn(() => "generated-id"),
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

const { aiTriggerService } = await import("../src/ai-trigger/service")

const WS = "ws-1"

afterEach(() => {
  vi.clearAllMocks()
})

describe("aiTriggerService.list", () => {
  test("paginates via the repository and computes pageCount", async () => {
    mockListPaginated.mockResolvedValueOnce([{ id: "ai-trigger-1" }])
    mockCount.mockResolvedValueOnce(3)

    const result = await aiTriggerService.list({
      workspaceId: WS,
      page: 1,
      perPage: 2,
    })

    expect(result).toEqual({ data: [{ id: "ai-trigger-1" }], pageCount: 2 })
    expect(mockListPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS }),
    )
  })
})

describe("aiTriggerService.findOrFail", () => {
  test("returns the row when found", async () => {
    mockFindByIdAndWorkspace.mockResolvedValueOnce({ id: "ai-trigger-1" })

    const result = await aiTriggerService.findOrFail({
      workspaceId: WS,
      id: "ai-trigger-1",
    })

    expect(result).toEqual({ id: "ai-trigger-1" })
  })

  test("throws not found when no row matches", async () => {
    mockFindByIdAndWorkspace.mockResolvedValueOnce(undefined)

    await expect(
      aiTriggerService.findOrFail({ workspaceId: WS, id: "missing" }),
    ).rejects.toThrow("AITrigger not found")
  })
})

describe("aiTriggerService.create", () => {
  test("inserts scoped to the workspace and audits", async () => {
    const created = { id: "ai-trigger-1", name: "New trigger" }
    mockInsertValues.mockReturnValueOnce({
      returning: vi.fn().mockResolvedValueOnce([created]),
    })

    const result = await aiTriggerService.create({
      workspaceId: WS,
      data: { name: "New trigger" },
    })

    expect(result).toEqual(created)
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, name: "New trigger" }),
    )
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "create" }),
    )
  })
})

describe("aiTriggerService.update", () => {
  test("verifies existence, updates, and audits", async () => {
    mockFindByIdAndWorkspace.mockResolvedValueOnce({
      id: "ai-trigger-1",
      name: "Old name",
    })
    const updated = { id: "ai-trigger-1", name: "New name" }
    mockUpdateWhere.mockReturnValueOnce({
      returning: vi.fn().mockResolvedValueOnce([updated]),
    })

    const result = await aiTriggerService.update(
      { workspaceId: WS, id: "ai-trigger-1" },
      { name: "New name" },
    )

    expect(result).toEqual(updated)
    expect(mockUpdateSet).toHaveBeenCalledWith({ name: "New name" })
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "update" }),
    )
  })

  test("throws not found before updating when the row does not exist", async () => {
    mockFindByIdAndWorkspace.mockResolvedValueOnce(undefined)

    await expect(
      aiTriggerService.update(
        { workspaceId: WS, id: "missing" },
        { name: "x" },
      ),
    ).rejects.toThrow("AITrigger not found")

    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe("aiTriggerService.duplicate", () => {
  test("copies the source row with a new id and _copy suffix", async () => {
    mockFindByIdAndWorkspace.mockResolvedValueOnce({
      id: "ai-trigger-1",
      workspaceId: WS,
      name: "Original",
      createdAt: new Date("2026-01-01"),
      updatedAt: new Date("2026-01-01"),
      description: "desc",
    })
    const duplicated = { id: "generated-id", name: "Original _copy" }
    mockInsertValues.mockReturnValueOnce({
      returning: vi.fn().mockResolvedValueOnce([duplicated]),
    })

    const result = await aiTriggerService.duplicate({
      workspaceId: WS,
      id: "ai-trigger-1",
    })

    expect(result).toEqual(duplicated)
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "generated-id",
        name: "Original _copy",
        workspaceId: WS,
        description: "desc",
      }),
    )
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "create" }),
    )
  })
})

describe("aiTriggerService.deleteMany", () => {
  test("no-ops without auditing when nothing matches", async () => {
    mockFindMany.mockResolvedValueOnce([])

    await aiTriggerService.deleteMany({ workspaceId: WS, ids: ["missing"] })

    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("deletes matched rows and audits", async () => {
    mockFindMany.mockResolvedValueOnce([{ id: "ai-trigger-1" }])

    await aiTriggerService.deleteMany({
      workspaceId: WS,
      ids: ["ai-trigger-1"],
    })

    expect(mockDelete).toHaveBeenCalled()
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: "delete" }),
    )
  })
})
