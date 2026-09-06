// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockTriggerFindFirst,
  mockDbUpdate,
  mockDbUpdateReturning,
  mockDispatchAuditRecord,
} = vi.hoisted(() => {
  const mockDbUpdateReturning = vi.fn().mockResolvedValue([{ id: "trigger-1" }])
  const mockDbUpdateWhere = vi
    .fn()
    .mockReturnValue({ returning: mockDbUpdateReturning })
  const mockDbUpdateSet = vi.fn().mockReturnValue({ where: mockDbUpdateWhere })
  const mockDbUpdate = vi.fn().mockReturnValue({ set: mockDbUpdateSet })

  return {
    mockTriggerFindFirst: vi.fn(),
    mockDbUpdate,
    mockDbUpdateReturning,
    mockDispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: { triggerModel: { findFirst: mockTriggerFindFirst } },
    update: mockDbUpdate,
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
  inArray: (...args: unknown[]) => ({ inArray: args }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  conditionModel: {},
  triggerModel: { id: "triggerModel.id" },
}))

vi.mock("@chatbotx.io/events", () => ({
  removeTriggerCache: vi.fn(),
  updateTriggerCache: vi.fn(),
}))

vi.mock("../src/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

vi.mock("../src/folder/service", () => ({
  folderService: { ensureExists: vi.fn() },
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

const { triggerService } = await import("../src/trigger/service")

const WS = "ws-1"
const TRIGGER_ID = "trigger-1"

describe("triggerService.updateSettings", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("throws notFoundException when the trigger does not exist", async () => {
    mockTriggerFindFirst.mockResolvedValue(undefined)

    await expect(
      triggerService.updateSettings({
        workspaceId: WS,
        id: TRIGGER_ID,
        name: "New name",
      }),
    ).rejects.toThrow("Trigger not found")

    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  test("no-ops without writing or auditing when nothing changed", async () => {
    mockTriggerFindFirst.mockResolvedValue({
      id: TRIGGER_ID,
      name: "Same name",
      active: true,
    })

    await triggerService.updateSettings({
      workspaceId: WS,
      id: TRIGGER_ID,
      name: "Same name",
    })

    expect(mockDbUpdate).not.toHaveBeenCalled()
    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("audits as 'enabled' when only active flips to true", async () => {
    mockTriggerFindFirst.mockResolvedValue({
      id: TRIGGER_ID,
      name: "Trigger",
      active: false,
    })

    await triggerService.updateSettings({
      workspaceId: WS,
      id: TRIGGER_ID,
      active: true,
    })

    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "update",
      detail: `enabled a trigger (#${TRIGGER_ID})`,
    })
  })

  test("audits as 'disabled' when only active flips to false", async () => {
    mockTriggerFindFirst.mockResolvedValue({
      id: TRIGGER_ID,
      name: "Trigger",
      active: true,
    })

    await triggerService.updateSettings({
      workspaceId: WS,
      id: TRIGGER_ID,
      active: false,
    })

    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "update",
      detail: `disabled a trigger (#${TRIGGER_ID})`,
    })
  })

  test("audits a generic 'updated' detail when a non-active field changes", async () => {
    mockTriggerFindFirst.mockResolvedValue({
      id: TRIGGER_ID,
      name: "Old name",
      active: true,
    })

    await triggerService.updateSettings({
      workspaceId: WS,
      id: TRIGGER_ID,
      name: "New name",
    })

    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "update",
      detail: `updated a trigger (#${TRIGGER_ID})`,
    })
  })

  test("does not audit when the update affects zero rows", async () => {
    mockTriggerFindFirst.mockResolvedValue({
      id: TRIGGER_ID,
      name: "Old name",
      active: true,
    })
    mockDbUpdateReturning.mockResolvedValueOnce([])

    await triggerService.updateSettings({
      workspaceId: WS,
      id: TRIGGER_ID,
      name: "New name",
    })

    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })
})
