import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSelectFor, mockUpdateReturning, mockUpdateSet, dbTransactionSpy } =
  vi.hoisted(() => {
    const mockSelectFor = vi.fn()
    const mockSelectWhere = vi.fn(() => ({ for: mockSelectFor }))
    const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }))
    const mockSelect = vi.fn(() => ({ from: mockSelectFrom }))

    const mockUpdateReturning = vi.fn()
    const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }))
    const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }))
    const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }))

    const dbClient = {
      select: mockSelect,
      update: mockUpdate,
    }
    const dbTransactionSpy = vi.fn(async (callback: (tx: unknown) => unknown) =>
      callback(dbClient),
    )

    return {
      mockSelectFor,
      mockUpdateReturning,
      mockUpdateSet,
      dbTransactionSpy,
    }
  })

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  db: {
    transaction: dbTransactionSpy,
  },
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  ilike: vi.fn(),
  inArray: vi.fn((field: unknown, values: unknown[]) => ({ field, values })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  minigameModel: {
    id: "id",
    workspaceId: "workspaceId",
    prizeSettings: "prizeSettings",
  },
}))

const baseInput = {
  workspaceId: "workspace-1",
  id: "minigame-1",
  type: "jackpot",
  generalSettings: { name: "Test minigame" },
  appearance: {},
  playerSettings: {},
  winningMessageSettings: {},
  nonWinningMessageSettings: {},
} as const

describe("MinigameService.update — prize quantity reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateReturning.mockResolvedValue([{ id: "minigame-1" }])
  })

  test("preserves the DB's live quantity when the admin didn't touch that prize", async () => {
    mockSelectFor.mockResolvedValue([
      {
        prizeSettings: {
          prizes: [{ id: "p1", quantity: 3 }],
          nonWinning: { loseRate: 25 },
        },
      },
    ])

    const { minigameService } = await import("../src/minigame/service")

    await minigameService.update({
      ...baseInput,
      prizeSettings: {
        prizes: [{ id: "p1", quantity: 10 }],
        nonWinning: { loseRate: 25 },
      },
      originalPrizeQuantities: { p1: 10 },
    } as never)

    const setArg = mockUpdateSet.mock.calls.at(-1)?.[0] as {
      prizeSettings: { prizes: { id: string; quantity?: number }[] }
    }
    expect(setArg.prizeSettings.prizes[0].quantity).toBe(3)
  })

  test("honors the admin's new quantity when they changed it", async () => {
    mockSelectFor.mockResolvedValue([
      {
        prizeSettings: {
          prizes: [{ id: "p1", quantity: 3 }],
          nonWinning: { loseRate: 25 },
        },
      },
    ])

    const { minigameService } = await import("../src/minigame/service")

    await minigameService.update({
      ...baseInput,
      prizeSettings: {
        prizes: [{ id: "p1", quantity: 50 }],
        nonWinning: { loseRate: 25 },
      },
      originalPrizeQuantities: { p1: 10 },
    } as never)

    const setArg = mockUpdateSet.mock.calls.at(-1)?.[0] as {
      prizeSettings: { prizes: { id: string; quantity?: number }[] }
    }
    expect(setArg.prizeSettings.prizes[0].quantity).toBe(50)
  })

  test("throws not-found when the row doesn't exist in this workspace", async () => {
    mockSelectFor.mockResolvedValue([])

    const { minigameService } = await import("../src/minigame/service")

    await expect(
      minigameService.update({
        ...baseInput,
        prizeSettings: { prizes: [], nonWinning: { loseRate: 100 } },
      } as never),
    ).rejects.toThrow()
  })
})
