// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockDelete,
  mockInstalledResourceFindMany,
  mockInstallationFindMany,
  mockRemoveTriggerCache,
} = vi.hoisted(() => {
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined)
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }))
  return {
    mockDelete,
    mockInstalledResourceFindMany: vi.fn(),
    mockInstallationFindMany: vi.fn(),
    mockRemoveTriggerCache: vi.fn(),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    delete: mockDelete,
    query: {
      templateInstalledResourceModel: {
        findMany: mockInstalledResourceFindMany,
      },
      templateInstallationModel: {
        findMany: mockInstallationFindMany,
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

vi.mock("@chatbotx.io/events", () => ({
  removeTriggerCache: mockRemoveTriggerCache,
}))

vi.mock("../src/base.service", () => ({
  BaseService: class BaseService {},
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

    await triggerService.deleteMany({ workspaceId: "ws-1", ids: ["trigger-1"] })

    expect(mockDelete).toHaveBeenCalled()
    expect(mockRemoveTriggerCache).toHaveBeenCalledWith("ws-1")
  })
})
