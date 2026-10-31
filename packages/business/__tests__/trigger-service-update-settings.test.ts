// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockTriggerFindFirst,
  mockDbUpdate,
  mockDbUpdateReturning,
  mockDispatchAuditRecord,
  mockLockOptions,
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
    mockLockOptions: vi.fn(),
  }
})

// The template lock guard has its own suite; these tests cover the service.
vi.mock("../src/template/installed-resource.service", async () => ({
  ...(await import("./helpers/template-guard-mocks")).templateGuardMocks({
    assertDeletable: vi.fn(),
    assertResourceEditable: vi.fn(),
  }),
}))

// Run the locked transaction against the same mocked client the test asserts on.
vi.mock("../src/template/template-resource-locks", async () => {
  const { db } = await import("@chatbotx.io/database/client")
  return {
    withTemplateLockedTransaction: (
      run: (tx: unknown) => unknown,
      options?: unknown,
    ) => {
      mockLockOptions(options)
      return run(db)
    },
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

const mockFindWithConditions = vi.fn()

vi.mock("@chatbotx.io/database/repositories", () => ({
  triggerRepository: {
    listPaginatedWithConditions: vi.fn(),
    findWithConditions: mockFindWithConditions,
  },
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
const { assertResourceEditable } = await import(
  "../src/template/installed-resource.service"
)
const { db: mockedDb } = await import("@chatbotx.io/database/client")

const WS = "ws-1"
const TRIGGER_ID = "trigger-1"

describe("triggerService.updateSettings", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  const setUpMocks = () => {
    mockFindWithConditions.mockResolvedValue({
      id: TRIGGER_ID,
      conditions: [],
    })
  }

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
    setUpMocks()
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
    setUpMocks()
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
    setUpMocks()
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
    setUpMocks()
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
    setUpMocks()
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

  test("runs the guard first inside the transaction, before the write", async () => {
    setUpMocks()
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

    expect(assertResourceEditable).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceKind: "trigger",
        resourceIds: [TRIGGER_ID],
        changedKeys: ["name"],
        tx: mockedDb,
      }),
    )
    expect(
      vi.mocked(assertResourceEditable).mock.invocationCallOrder[0],
    ).toBeLessThan(mockDbUpdate.mock.invocationCallOrder[0] as number)
  })

  test("locks the trigger before the stored row is read", async () => {
    setUpMocks()
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

    expect(mockLockOptions).toHaveBeenCalledWith({
      workspaceId: expect.any(String),
      initialKeys: [{ kind: "trigger", resourceId: TRIGGER_ID }],
    })
    expect(mockLockOptions.mock.invocationCallOrder[0]).toBeLessThan(
      mockTriggerFindFirst.mock.invocationCallOrder[0] as number,
    )
  })

  test("does not write when the guard blocks the edit", async () => {
    setUpMocks()
    mockTriggerFindFirst.mockResolvedValue({
      id: TRIGGER_ID,
      name: "Old name",
      active: true,
    })
    vi.mocked(assertResourceEditable).mockRejectedValueOnce(new Error("locked"))

    await expect(
      triggerService.updateSettings({
        workspaceId: WS,
        id: TRIGGER_ID,
        name: "New name",
      }),
    ).rejects.toThrow("locked")
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })
})
