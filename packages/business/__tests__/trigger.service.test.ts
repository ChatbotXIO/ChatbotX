// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockAudit,
  mockCount,
  mockDelete,
  mockEnsureExists,
  mockInsertReturning,
  mockInsertValues,
  mockInstalledResourceFindMany,
  mockInstallationFindMany,
  mockRemoveTriggerCache,
  mockTriggerFindMany,
  mockUpdateTriggerCache,
} = vi.hoisted(() => {
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined)
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))
  const mockInsertReturning = vi.fn()
  const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }))
  return {
    mockAudit: vi.fn(),
    mockCount: vi.fn(),
    mockDelete,
    mockEnsureExists: vi.fn(),
    mockInsertReturning,
    mockInsertValues,
    mockInstalledResourceFindMany: vi.fn(),
    mockInstallationFindMany: vi.fn(),
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
      templateInstalledResourceModel: {
        findMany: mockInstalledResourceFindMany,
      },
      templateInstallationModel: {
        findMany: mockInstallationFindMany,
      },
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

vi.mock("../src/folder/service", () => ({
  folderService: { ensureExists: mockEnsureExists },
}))

const { triggerService } = await import("../src/trigger/service")

describe("triggerService.deleteMany", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("blocks the delete when the trigger was installed from a template with allowDelete: false", async () => {
    mockInstalledResourceFindMany.mockResolvedValue([
      { resourceId: "trigger-1", installationId: "install-1" },
    ])
    mockInstallationFindMany.mockResolvedValue([
      { id: "install-1", permissions: { allowDelete: false } },
    ])

    await expect(
      triggerService.deleteMany({ workspaceId: "ws-1", ids: ["trigger-1"] }),
    ).rejects.toThrow(
      "This resource was installed from a template that disallows deletion",
    )

    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockRemoveTriggerCache).not.toHaveBeenCalled()
  })

  test("deletes and invalidates the cache when nothing blocks it", async () => {
    mockInstalledResourceFindMany.mockResolvedValue([])
    mockTriggerFindMany.mockResolvedValue([])

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
