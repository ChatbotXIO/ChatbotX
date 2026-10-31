// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

vi.mock("../src/template/uninstall-references", () => ({
  referencedParentsOf: () => [],
}))

// The broadcast policy import reaches quota/workspace modules these narrow mocks omit.
vi.mock("../src/broadcast/plan-policy.service", () => ({
  broadcastPlanPolicyService: {},
}))

const {
  mockAssertDeletable,
  mockAudit,
  mockCount,
  mockDelete,
  mockEnsureExists,
  mockInsertReturning,
  mockInsertValues,
  mockRemoveTriggerCache,
  mockTriggerFindMany,
  mockUpdateTriggerCache,
} = vi.hoisted(() => {
  const mockDeleteWhere = vi.fn(() => ({
    returning: vi.fn().mockResolvedValue([]),
  }))
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))
  const mockInsertReturning = vi.fn()
  const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }))
  return {
    mockAssertDeletable: vi.fn(),
    mockAudit: vi.fn(),
    mockCount: vi.fn(),
    mockDelete,
    mockEnsureExists: vi.fn(),
    mockInsertReturning,
    mockInsertValues,
    mockRemoveTriggerCache: vi.fn(),
    mockTriggerFindMany: vi.fn(),
    mockUpdateTriggerCache: vi.fn(),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    $count: mockCount,
    delete: mockDelete,
    insert: vi.fn(() => ({ values: mockInsertValues })),
    query: {
      triggerModel: {
        findMany: mockTriggerFindMany,
      },
    },
  },
  and: (...conditions: unknown[]) => ({ conditions }),
  eq: (field: unknown, value: unknown) => ({ field, value }),
  inArray: (field: unknown, values: unknown[]) => ({ field, values }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  triggerModel: { id: "id", workspaceId: "workspaceId" },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  triggerRepository: { listPaginatedWithConditions: vi.fn() },
}))

vi.mock("@chatbotx.io/events", () => ({
  removeTriggerCache: mockRemoveTriggerCache,
  updateTriggerCache: mockUpdateTriggerCache,
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: vi.fn(() => "generated-id"),
}))

vi.mock("../src/base.service", () => ({
  BaseService: class BaseService {
    audit = mockAudit
  },
}))

vi.mock("../src/template/installed-resource.service", async () => ({
  ...(await import("./helpers/template-guard-mocks")).templateGuardMocks({
    assertDeletable: mockAssertDeletable,
  }),
}))

vi.mock("../src/folder/service", () => ({
  folderService: { ensureExists: mockEnsureExists },
}))

const { triggerService } = await import("../src/trigger/service")

describe("triggerService.deleteMany", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("blocks the delete when the template guard refuses it", async () => {
    mockAssertDeletable.mockRejectedValue(
      new Error("templateAllowDeleteViolation"),
    )

    await expect(
      triggerService.deleteMany({ workspaceId: "ws-1", ids: ["trigger-1"] }),
    ).rejects.toThrow("templateAllowDeleteViolation")

    expect(mockAssertDeletable).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        resourceKind: "trigger",
        resourceIds: ["trigger-1"],
      }),
    )
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockRemoveTriggerCache).not.toHaveBeenCalled()
  })

  test("deletes and invalidates the cache when nothing blocks it", async () => {
    mockAssertDeletable.mockResolvedValue(undefined)

    await triggerService.deleteMany({ workspaceId: "ws-1", ids: ["trigger-1"] })

    expect(mockDelete).toHaveBeenCalled()
    expect(mockRemoveTriggerCache).toHaveBeenCalledWith("ws-1")
  })
})

describe("triggerService.create", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("rejects when the workspace is already at the trigger quota", async () => {
    mockCount.mockResolvedValue(50)

    await expect(
      triggerService.create({
        workspaceId: "ws-1",
        data: { name: "New trigger" },
        folderType: "trigger",
      }),
    ).rejects.toMatchObject({
      field: "_",
      message: "validation.maxItemsReached",
      data: { max: 50, feature: "triggers" },
    })

    expect(mockEnsureExists).not.toHaveBeenCalled()
    expect(mockInsertValues).not.toHaveBeenCalled()
    expect(mockUpdateTriggerCache).not.toHaveBeenCalled()
  })

  test("checks the folder exists when a folderId is given", async () => {
    mockCount.mockResolvedValue(0)
    mockInsertReturning.mockResolvedValue([{ id: "trigger-1" }])

    await triggerService.create({
      workspaceId: "ws-1",
      data: { name: "New trigger", folderId: "folder-1" },
      folderType: "trigger",
    })

    expect(mockEnsureExists).toHaveBeenCalledWith({
      id: "folder-1",
      workspaceId: "ws-1",
      folderType: "trigger",
    })
  })

  test("inserts, invalidates the cache, and audits on success", async () => {
    mockCount.mockResolvedValue(0)
    mockInsertReturning.mockResolvedValue([{ id: "trigger-1" }])

    const result = await triggerService.create({
      workspaceId: "ws-1",
      data: { name: "New trigger" },
      folderType: "trigger",
    })

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "generated-id",
        workspaceId: "ws-1",
        name: "New trigger",
        actions: [],
      }),
    )
    expect(mockUpdateTriggerCache).toHaveBeenCalledWith("ws-1")
    expect(mockAudit).toHaveBeenCalledWith(
      "create",
      "created a new trigger (#trigger-1)",
    )
    expect(result).toEqual({ id: "trigger-1" })
  })
})
