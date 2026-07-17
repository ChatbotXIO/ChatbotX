import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockCount,
  mockDbFindFirst,
  mockDbFrom,
  mockDbGroupBy,
  mockDbInsert,
  mockDbOnConflictDoUpdate,
  mockDbReturning,
  mockDbSelect,
  mockDbSet,
  mockDbUpdate,
  mockDbValues,
  mockDbSelectWhere,
  mockDbWhere,
  mockEq,
  mockInArray,
  mockIsNotNull,
  mockLt,
  mockLte,
  mockSql,
} = vi.hoisted(() => {
  const insertChain = {
    onConflictDoUpdate: vi.fn(),
    returning: vi.fn(),
    values: vi.fn(),
  }
  insertChain.values.mockReturnValue(insertChain)
  insertChain.onConflictDoUpdate.mockReturnValue(insertChain)
  insertChain.returning.mockResolvedValue([])
  const mockDbInsert = vi.fn(() => insertChain)
  const mockDbReturning = vi.fn().mockResolvedValue([])
  const updateChain = {
    returning: mockDbReturning,
    set: vi.fn(),
    where: vi.fn(),
  }
  updateChain.set.mockReturnValue(updateChain)
  updateChain.where.mockReturnValue(updateChain)
  const selectChain = {
    from: vi.fn(),
    groupBy: vi.fn(),
    where: vi.fn(),
  }
  selectChain.from.mockReturnValue(selectChain)
  selectChain.where.mockReturnValue(selectChain)
  selectChain.groupBy.mockResolvedValue([])

  return {
    mockCount: vi.fn(() => "count()"),
    mockDbFindFirst: vi.fn(),
    mockDbFrom: selectChain.from,
    mockDbGroupBy: selectChain.groupBy,
    mockDbInsert,
    mockDbOnConflictDoUpdate: insertChain.onConflictDoUpdate,
    mockDbReturning,
    mockDbSelect: vi.fn(() => selectChain),
    mockDbSet: updateChain.set,
    mockDbUpdate: vi.fn(() => updateChain),
    mockDbValues: insertChain.values,
    mockDbSelectWhere: selectChain.where,
    mockDbWhere: updateChain.where,
    mockEq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
    mockInArray: vi.fn((field: unknown, values: unknown[]) => ({
      field,
      values,
    })),
    mockIsNotNull: vi.fn((field: unknown) => ({ field, isNotNull: true })),
    mockLt: vi.fn((field: unknown, value: unknown) => ({ field, value })),
    mockLte: vi.fn((field: unknown, value: unknown) => ({ field, value })),
    mockSql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    })),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  count: mockCount,
  db: {
    insert: mockDbInsert,
    select: mockDbSelect,
    update: mockDbUpdate,
    query: {
      contactOnSmartDelayModel: {
        findFirst: mockDbFindFirst,
      },
    },
  },
  eq: mockEq,
  inArray: mockInArray,
  isNotNull: mockIsNotNull,
  lt: mockLt,
  lte: mockLte,
  sql: mockSql,
}))

const { smartDelayService } = await import("../src/smart-delay/service")

const smartDelayRow = {
  id: "row-1",
  workspaceId: "workspace-1",
  flowId: "flow-1",
  flowVersionId: "flow-version-1",
  contactInboxId: "contact-inbox-1",
  conversationId: "conversation-1",
  nodeId: "next-node",
  stepId: "step-1",
  type: "followUp",
  createdAt: new Date("2026-07-16T00:00:00.000Z"),
  triggerAt: new Date("2026-07-16T00:01:00.000Z"),
  status: "pending",
}

describe("smartDelayService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbReturning.mockResolvedValue([])
    mockDbValues.mockReturnValue({
      onConflictDoUpdate: mockDbOnConflictDoUpdate,
      returning: mockDbReturning,
    })
    mockDbOnConflictDoUpdate.mockReturnValue({ returning: mockDbReturning })
    mockDbGroupBy.mockResolvedValue([])
  })

  test("create inserts a smart-delay row", async () => {
    await smartDelayService.create({ data: smartDelayRow as never })

    expect(mockDbInsert).toHaveBeenCalledOnce()
    expect(mockDbValues).toHaveBeenCalledWith(smartDelayRow)
  })

  test("upsertFollowUp resets an active follow-up row through the partial unique key", async () => {
    const updatedRow = {
      ...smartDelayRow,
      id: "existing-row",
      triggerAt: new Date("2026-07-16T00:02:00.000Z"),
      status: "pending",
    }
    mockDbReturning.mockResolvedValueOnce([updatedRow])

    await expect(
      smartDelayService.upsertFollowUp({ data: updatedRow as never }),
    ).resolves.toEqual(updatedRow)

    expect(mockDbOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.any(Array),
        targetWhere: expect.any(Object),
        set: expect.objectContaining({
          conversationId: "conversation-1",
          flowVersionId: "flow-version-1",
          nodeId: "next-node",
          status: "pending",
          triggerAt: updatedRow.triggerAt,
        }),
      }),
    )
    expect(mockDbReturning).toHaveBeenCalledOnce()
  })

  test("findById returns the matching row or null", async () => {
    mockDbFindFirst.mockResolvedValueOnce(smartDelayRow)

    await expect(smartDelayService.findById({ id: "row-1" })).resolves.toEqual(
      smartDelayRow,
    )
    expect(mockDbFindFirst).toHaveBeenCalledWith({ where: { id: "row-1" } })

    mockDbFindFirst.mockResolvedValueOnce(undefined)
    await expect(
      smartDelayService.findById({ id: "missing-row" }),
    ).resolves.toBeNull()
  })

  test("countByFlowStep returns grouped status counts by step", async () => {
    mockDbGroupBy.mockResolvedValueOnce([
      { stepId: "step-1", status: "pending", total: 2 },
      { stepId: "step-1", status: "scheduled", total: 3 },
      { stepId: "step-2", status: "completed", total: 4 },
      { stepId: null, status: "completed", total: 99 },
    ])

    await expect(
      smartDelayService.countByFlowStep({
        workspaceId: "workspace-1",
        flowId: "flow-1",
      }),
    ).resolves.toEqual([
      { stepId: "step-1", status: "pending", total: 2 },
      { stepId: "step-1", status: "scheduled", total: 3 },
      { stepId: "step-2", status: "completed", total: 4 },
    ])

    expect(mockDbSelect).toHaveBeenCalledWith({
      stepId: expect.anything(),
      status: expect.anything(),
      total: "count()",
    })
    expect(mockDbFrom).toHaveBeenCalledOnce()
    expect(mockEq).toHaveBeenCalledWith(expect.anything(), "workspace-1")
    expect(mockEq).toHaveBeenCalledWith(expect.anything(), "flow-1")
    expect(mockIsNotNull).toHaveBeenCalledWith(expect.anything())
    expect(mockDbSelectWhere).toHaveBeenCalledOnce()
    expect(mockDbGroupBy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
    )
  })

  test("markCompleted and markCanceled update the row status", async () => {
    await smartDelayService.markCompleted({ id: "row-1" })
    expect(mockDbSet).toHaveBeenCalledWith({ status: "completed" })

    await smartDelayService.markCanceled({ id: "row-1" })
    expect(mockDbSet).toHaveBeenCalledWith({ status: "canceled" })
    expect(mockDbWhere).toHaveBeenCalledTimes(2)
  })

  test("claimDueRows claims pending rows up to the window", async () => {
    mockDbReturning.mockResolvedValueOnce([
      { ...smartDelayRow, status: "scheduled" },
    ])
    const windowUntil = new Date("2026-07-16T00:05:00.000Z")

    await expect(
      smartDelayService.claimDueRows({ windowUntil }),
    ).resolves.toEqual([{ ...smartDelayRow, status: "scheduled" }])

    expect(mockDbSet).toHaveBeenCalledWith({ status: "scheduled" })
    expect(mockLte).toHaveBeenCalledWith(expect.anything(), windowUntil)
    expect(mockDbReturning).toHaveBeenCalledOnce()
  })

  test("claimForRun returns true only when the scheduled row is claimed", async () => {
    mockDbReturning.mockResolvedValueOnce([{ id: "row-1" }])

    await expect(
      smartDelayService.claimForRun({ id: "row-1", to: "completed" }),
    ).resolves.toBe(true)

    expect(mockDbSet).toHaveBeenCalledWith({ status: "completed" })
    expect(mockDbWhere).toHaveBeenCalledOnce()

    mockDbReturning.mockResolvedValueOnce([])
    await expect(
      smartDelayService.claimForRun({ id: "row-1", to: "canceled" }),
    ).resolves.toBe(false)
  })

  test("sweepStuckScheduled resets overdue scheduled rows", async () => {
    mockDbReturning.mockResolvedValueOnce([{ id: "row-1" }, { id: "row-2" }])
    const olderThan = new Date("2026-07-16T00:10:00.000Z")

    await expect(
      smartDelayService.sweepStuckScheduled({ olderThan }),
    ).resolves.toBe(2)

    expect(mockDbSet).toHaveBeenCalledWith({ status: "pending" })
    expect(mockLt).toHaveBeenCalledWith(expect.anything(), olderThan)
  })

  test("resetToPending updates only the provided ids", async () => {
    await smartDelayService.resetToPending({ ids: ["row-1", "row-2"] })

    expect(mockDbSet).toHaveBeenCalledWith({ status: "pending" })
    expect(mockInArray).toHaveBeenCalledWith(expect.anything(), [
      "row-1",
      "row-2",
    ])
  })

  test("resetToPending skips empty batches", async () => {
    await smartDelayService.resetToPending({ ids: [] })

    expect(mockDbUpdate).not.toHaveBeenCalled()
  })
})
