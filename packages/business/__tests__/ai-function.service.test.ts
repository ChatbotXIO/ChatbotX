import type { AIFunctionModel } from "@chatbotx.io/database/types"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockDelete,
  mockDeleteReturning,
  mockFindFirst,
  mockFindMany,
  mockInstalledResourceFindMany,
  mockInstallationFindMany,
  mockInsert,
  mockInsertReturning,
  mockUpdate,
  mockUpdateReturning,
} = vi.hoisted(() => {
  const mockInsertReturning = vi.fn()
  const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }))
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }))

  const mockUpdateReturning = vi.fn()
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }))
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }))

  const mockDeleteReturning = vi.fn()
  const mockDeleteWhere = vi.fn(() => ({ returning: mockDeleteReturning }))
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))

  return {
    mockDelete,
    mockDeleteReturning,
    mockFindFirst: vi.fn(),
    mockFindMany: vi.fn(async () => []),
    mockInstalledResourceFindMany: vi.fn(),
    mockInstallationFindMany: vi.fn(),
    mockInsert,
    mockInsertReturning,
    mockUpdate,
    mockUpdateReturning,
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    delete: mockDelete,
    insert: mockInsert,
    query: {
      aiFunctionModel: {
        findFirst: mockFindFirst,
        findMany: mockFindMany,
      },
      templateInstalledResourceModel: {
        findMany: mockInstalledResourceFindMany,
      },
      templateInstallationModel: {
        findMany: mockInstallationFindMany,
      },
    },
    update: mockUpdate,
  },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  aiFunctionModel: {
    id: "id",
    workspaceId: "workspaceId",
    name: "name",
  },
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: () => "function-1",
}))

const dispatchAuditRecord = vi.fn()
vi.mock("../src/audit/dispatcher", () => ({ dispatchAuditRecord }))

const { aiFunctionService } = await import("../src/ai-function/service")

const workspaceId = "workspace-1"
const t = ((key: string) => key) as unknown as Parameters<
  typeof aiFunctionService.updateAIFunction
>[2]

const aiFunction = {
  id: "function-1",
  workspaceId,
  name: "Lookup order",
} as AIFunctionModel

const request = {
  name: "Lookup order",
  purpose: null,
  dataCollect: [],
  outputMessage: null,
  triggerFlowId: null,
}

function lastAuditDetail(): string {
  return dispatchAuditRecord.mock.calls.at(-1)?.[0]?.detail
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFindFirst.mockResolvedValue(aiFunction)
  mockInsertReturning.mockResolvedValue([{ id: "function-1" }])
  mockUpdateReturning.mockResolvedValue([{ id: "function-1" }])
  mockDeleteReturning.mockResolvedValue([{ id: "function-1" }])
  mockInstalledResourceFindMany.mockResolvedValue([])
  mockInstallationFindMany.mockResolvedValue([])
})

describe("aiFunctionService audit messages", () => {
  test("create logs by id", async () => {
    await aiFunctionService.create(workspaceId, request)

    expect(lastAuditDetail()).toBe("created a new AI Function (#function-1)")
  })

  test("updateAIFunction logs by id", async () => {
    await aiFunctionService.updateAIFunction(
      { id: "function-1", workspaceId },
      request,
      t,
    )

    expect(lastAuditDetail()).toBe("updated an AI Function (#function-1)")
  })

  test("deleteAIFunction logs by id", async () => {
    await aiFunctionService.deleteAIFunction(
      { aiFunctionId: "function-1", workspaceId },
      t,
    )

    expect(lastAuditDetail()).toBe("deleted an AI Function (#function-1)")
  })

  test("updateAIFunction throws when the function is not found", async () => {
    mockFindFirst.mockResolvedValue(undefined)

    await expect(
      aiFunctionService.updateAIFunction(
        { id: "missing", workspaceId },
        request,
        t,
      ),
    ).rejects.toThrow()

    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("deleteAIFunction throws when the function is not found", async () => {
    mockFindFirst.mockResolvedValue(undefined)

    await expect(
      aiFunctionService.deleteAIFunction(
        { aiFunctionId: "missing", workspaceId },
        t,
      ),
    ).rejects.toThrow()

    expect(dispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("list returns AI Functions scoped to the workspace", async () => {
    mockFindMany.mockResolvedValue([aiFunction])

    const result = await aiFunctionService.list({ workspaceId })

    expect(result).toEqual([aiFunction])
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { workspaceId },
    })
  })
})
