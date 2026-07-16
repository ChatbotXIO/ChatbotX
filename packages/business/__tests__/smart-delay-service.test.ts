import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockDbFindFirst,
  mockDbInsert,
  mockDbReturning,
  mockDbSet,
  mockDbUpdate,
  mockDbValues,
  mockDbWhere,
  mockEq,
  mockInArray,
  mockLte,
} = vi.hoisted(() => {
  const mockDbValues = vi.fn().mockResolvedValue(undefined)
  const mockDbInsert = vi.fn(() => ({ values: mockDbValues }))
  const mockDbReturning = vi.fn().mockResolvedValue([])
  const updateChain = {
    returning: mockDbReturning,
    set: vi.fn(),
    where: vi.fn(),
  }
  updateChain.set.mockReturnValue(updateChain)
  updateChain.where.mockReturnValue(updateChain)

  return {
    mockDbFindFirst: vi.fn(),
    mockDbInsert,
    mockDbReturning,
    mockDbSet: updateChain.set,
    mockDbUpdate: vi.fn(() => updateChain),
    mockDbValues,
    mockDbWhere: updateChain.where,
    mockEq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
    mockInArray: vi.fn((field: unknown, values: unknown[]) => ({
      field,
      values,
    })),
    mockLte: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  }
})

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  db: {
    insert: mockDbInsert,
    update: mockDbUpdate,
    query: {
      contactOnSmartDelayModel: {
        findFirst: mockDbFindFirst,
      },
    },
  },
  eq: mockEq,
  inArray: mockInArray,
  lte: mockLte,
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
    mockDbValues.mockResolvedValue(undefined)
  })

  test("create inserts a smart-delay row", async () => {
    await smartDelayService.create({ data: smartDelayRow as never })

    expect(mockDbInsert).toHaveBeenCalledOnce()
    expect(mockDbValues).toHaveBeenCalledWith(smartDelayRow)
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

  test("markCompleted and markCanceled update the row status", async () => {
    await smartDelayService.markCompleted({ id: "row-1" })
    expect(mockDbSet).toHaveBeenCalledWith({ status: "completed" })

    await smartDelayService.markCanceled({ id: "row-1" })
    expect(mockDbSet).toHaveBeenCalledWith({ status: "canceled" })
    expect(mockDbWhere).toHaveBeenCalledTimes(2)
  })

  test("claimDueRows claims pending rows up to the window", async () => {
    mockDbReturning.mockResolvedValueOnce([smartDelayRow])
    const windowUntil = new Date("2026-07-16T00:05:00.000Z")

    await expect(
      smartDelayService.claimDueRows({ windowUntil }),
    ).resolves.toEqual([smartDelayRow])

    expect(mockDbSet).toHaveBeenCalledWith({ status: "completed" })
    expect(mockLte).toHaveBeenCalledWith(expect.anything(), windowUntil)
    expect(mockDbReturning).toHaveBeenCalledOnce()
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
