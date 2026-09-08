// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const {
  mockCreateId,
  mockInsert,
  mockInsertValues,
  mockFindOrFail,
  mockIsUniqueViolationError,
  mockDelete,
  mockDispatchAuditRecord,
  mockStepFindFirst,
  mockStepUpdate,
  mockStepUpdateSet,
  mockStepUpdateReturning,
  mockStepInsert,
  mockStepDelete,
  sequenceModelStub,
  sequenceStepModelStub,
} = vi.hoisted(() => {
  const mockInsertValues = vi.fn().mockResolvedValue(undefined)
  const mockInsert = vi.fn().mockReturnValue({ values: mockInsertValues })
  const mockDeleteWhere = vi.fn().mockResolvedValue(undefined)
  const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere })

  const mockStepUpdateReturning = vi.fn()
  const mockStepUpdateWhere = vi
    .fn()
    .mockReturnValue({ returning: mockStepUpdateReturning })
  const mockStepUpdateSet = vi
    .fn()
    .mockReturnValue({ where: mockStepUpdateWhere })
  const mockStepUpdate = vi.fn().mockReturnValue({ set: mockStepUpdateSet })

  const mockStepInsertReturning = vi.fn()
  const mockStepInsertValues = vi
    .fn()
    .mockReturnValue({ returning: mockStepInsertReturning })
  const mockStepInsert = vi
    .fn()
    .mockReturnValue({ values: mockStepInsertValues })

  const mockStepDeleteWhere = vi.fn().mockResolvedValue(undefined)
  const mockStepDelete = vi.fn().mockReturnValue({ where: mockStepDeleteWhere })

  return {
    mockCreateId: vi.fn(() => "generated-id"),
    mockInsert,
    mockInsertValues,
    mockFindOrFail: vi.fn(),
    mockIsUniqueViolationError: vi.fn(() => false),
    mockDelete,
    mockDispatchAuditRecord: vi.fn().mockResolvedValue(undefined),
    mockStepFindFirst: vi.fn(),
    mockStepUpdate,
    mockStepUpdateSet,
    mockStepUpdateReturning,
    mockStepInsert,
    mockStepDelete,
    sequenceModelStub: {
      id: "sequenceModel.id",
      workspaceId: "sequenceModel.workspaceId",
    },
    sequenceStepModelStub: { id: "sequenceStepModel.id" },
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: (model: unknown) =>
      model === sequenceStepModelStub ? mockStepInsert() : mockInsert(),
    delete: (model: unknown) =>
      model === sequenceStepModelStub ? mockStepDelete() : mockDelete(),
    update: () => mockStepUpdate(),
    query: {
      sequenceStepModel: { findFirst: mockStepFindFirst },
    },
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
  findOrFail: mockFindOrFail,
  isUniqueViolationError: mockIsUniqueViolationError,
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  sequenceModel: sequenceModelStub,
  sequenceStepModel: sequenceStepModelStub,
}))

vi.mock("@chatbotx.io/utils", () => ({
  createId: mockCreateId,
}))

vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mockDispatchAuditRecord,
}))

const { sequenceService } = await import("../src/sequence/service")

const WS = "ws-1"

describe("sequenceService.create", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("creates the sequence and audits", async () => {
    mockInsert.mockReturnValue({ values: mockInsertValues })
    mockInsertValues.mockResolvedValue(undefined)

    const result = await sequenceService.create({
      workspaceId: WS,
      name: "My Sequence",
    })

    expect(result).toEqual({ sequenceId: "generated-id" })
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "create",
      detail: "created a new sequence (#generated-id)",
    })
  })

  test("throws validationException on the name field for a 23505 unique violation", async () => {
    const dbError = Object.assign(new Error("unique violation"), {
      cause: { code: "23505" },
    })
    mockInsertValues.mockRejectedValueOnce(dbError)
    mockIsUniqueViolationError.mockReturnValueOnce(true)

    await expect(
      sequenceService.create({ workspaceId: WS, name: "Duplicate" }),
    ).rejects.toMatchObject({
      code: "validation",
      field: "name",
      message: "Name is already taken.",
    })
  })

  test("rethrows non-23505 database errors", async () => {
    const dbError = Object.assign(new Error("other db error"), {
      cause: { code: "XXXXX" },
    })
    mockInsertValues.mockRejectedValueOnce(dbError)
    mockIsUniqueViolationError.mockReturnValueOnce(false)

    await expect(
      sequenceService.create({ workspaceId: WS, name: "Seq" }),
    ).rejects.toThrow("other db error")
  })
})

describe("sequenceService.update", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("no-ops when nothing changed", async () => {
    mockFindOrFail.mockResolvedValue({
      id: "seq-1",
      name: "Seq",
      active: true,
    })

    await sequenceService.update(
      { workspaceId: WS, id: "seq-1" },
      { active: true },
    )

    expect(mockStepUpdate).not.toHaveBeenCalled()
    expect(mockDispatchAuditRecord).not.toHaveBeenCalled()
  })

  test("updates and audits with a generic detail for multi-field changes", async () => {
    mockFindOrFail.mockResolvedValue({
      id: "seq-1",
      name: "Seq",
      active: false,
    })
    mockStepUpdateReturning.mockResolvedValue([{ id: "seq-1" }])

    await sequenceService.update(
      { workspaceId: WS, id: "seq-1" },
      { name: "New Name", active: true },
    )

    expect(mockStepUpdateSet).toHaveBeenCalledWith({
      name: "New Name",
      active: true,
    })
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "update",
      detail: "updated a sequence (#seq-1)",
    })
  })

  test("audits an 'enabled' detail when only active flips true", async () => {
    mockFindOrFail.mockResolvedValue({
      id: "seq-1",
      name: "Seq",
      active: false,
    })
    mockStepUpdateReturning.mockResolvedValue([{ id: "seq-1" }])

    await sequenceService.update(
      { workspaceId: WS, id: "seq-1" },
      { active: true },
    )

    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "update",
      detail: "enabled a sequence (#seq-1)",
    })
  })

  test("throws validationException on the name field for a 23505 unique violation", async () => {
    mockFindOrFail.mockResolvedValue({
      id: "seq-1",
      name: "Seq",
      active: false,
    })
    const dbError = Object.assign(new Error("unique violation"), {
      cause: { code: "23505" },
    })
    mockStepUpdateReturning.mockRejectedValueOnce(dbError)
    mockIsUniqueViolationError.mockReturnValueOnce(true)

    await expect(
      sequenceService.update(
        { workspaceId: WS, id: "seq-1" },
        { name: "Duplicate" },
      ),
    ).rejects.toMatchObject({
      code: "validation",
      field: "name",
      message: "Name is already taken.",
    })
  })

  test("propagates the not-found error and never updates", async () => {
    mockFindOrFail.mockRejectedValue(new Error("Sequence not found"))

    await expect(
      sequenceService.update({ workspaceId: WS, id: "missing" }, { name: "X" }),
    ).rejects.toThrow("Sequence not found")

    expect(mockStepUpdate).not.toHaveBeenCalled()
  })
})

describe("sequenceService.delete", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("verifies ownership, deletes, and audits with the sequence id", async () => {
    mockFindOrFail.mockResolvedValue({ id: "seq-1" })

    await sequenceService.delete({ workspaceId: WS, id: "seq-1" })

    expect(mockDelete).toHaveBeenCalled()
    expect(mockDispatchAuditRecord).toHaveBeenCalledWith({
      action: "delete",
      detail: "deleted a sequence (#seq-1)",
    })
  })

  test("propagates the not-found error and never deletes", async () => {
    mockFindOrFail.mockRejectedValue(new Error("Sequence not found"))

    await expect(
      sequenceService.delete({ workspaceId: WS, id: "missing" }),
    ).rejects.toThrow("Sequence not found")

    expect(mockDelete).not.toHaveBeenCalled()
  })
})

describe("sequenceService.updateStep / deleteStep cross-workspace rejection", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  test("updateStep throws when the step does not exist", async () => {
    mockStepFindFirst.mockResolvedValue(undefined)

    await expect(
      sequenceService.updateStep({
        workspaceId: WS,
        stepId: "step-1",
        data: { order: 0 },
      }),
    ).rejects.toThrow("Step not found")
  })

  test("updateStep throws not-found (not an ownership-revealing message) for a step in a different workspace", async () => {
    mockStepFindFirst.mockResolvedValue({
      id: "step-1",
      order: 1,
      sequence: { workspaceId: "other-ws" },
    })

    // Masked as "not found" rather than an "Unauthorized" message, so a
    // caller can't distinguish a missing step from a foreign one.
    await expect(
      sequenceService.updateStep({
        workspaceId: WS,
        stepId: "step-1",
        data: { order: 0 },
      }),
    ).rejects.toThrow("Step not found")
  })

  test("deleteStep throws when the step does not exist", async () => {
    mockStepFindFirst.mockResolvedValue(undefined)

    await expect(
      sequenceService.deleteStep({ workspaceId: WS, stepId: "step-1" }),
    ).rejects.toThrow("Step not found")
  })

  test("deleteStep throws not-found (not an ownership-revealing message) for a step in a different workspace", async () => {
    mockStepFindFirst.mockResolvedValue({
      id: "step-1",
      sequence: { workspaceId: "other-ws" },
    })

    await expect(
      sequenceService.deleteStep({ workspaceId: WS, stepId: "step-1" }),
    ).rejects.toThrow("Step not found")

    expect(mockStepDelete).not.toHaveBeenCalled()
  })

  test("deleteStep deletes when the step belongs to the workspace", async () => {
    mockStepFindFirst.mockResolvedValue({
      id: "step-1",
      sequence: { workspaceId: WS },
    })

    await sequenceService.deleteStep({ workspaceId: WS, stepId: "step-1" })

    expect(mockStepDelete).toHaveBeenCalled()
  })
})
