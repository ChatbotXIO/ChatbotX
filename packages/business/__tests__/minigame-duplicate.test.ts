import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  insertValues,
  insertReturning,
  findFirst,
  findMany,
  isUniqueViolationError,
  assertResourceEditable,
  lockedTransaction,
} = vi.hoisted(() => ({
  assertResourceEditable: vi.fn(),
  lockedTransaction: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  isUniqueViolationError: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  minigameRepository: {
    listNamesWithPrefix: async (_input: unknown, _tx?: unknown) =>
      ((await findMany()) as { name: string }[]).map((row) => row.name),
  },
}))

const tx: Record<string, unknown> = {
  insert: vi.fn(() => ({
    values: (values: unknown) => {
      insertValues(values)
      return { returning: insertReturning }
    },
  })),
  query: { minigameModel: { findFirst, findMany } },
  transaction: (run: (savepoint: unknown) => unknown) => run(tx),
}

vi.mock("../src/template/template-resource-locks", () => ({
  withTemplateLockedTransaction: async (
    run: (tx: unknown) => unknown,
    options: unknown,
  ) => {
    lockedTransaction(options)
    return await run(tx)
  },
}))
vi.mock("../src/template/installed-resource.service", () => ({
  assertResourceEditable,
  changedKeysOf: vi.fn(),
  withDeleteGuard: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  db: tx,
  eq: vi.fn(),
  ilike: vi.fn(),
  inArray: vi.fn(),
  isUniqueViolationError,
}))
vi.mock("@chatbotx.io/database/schema", () => ({ minigameModel: {} }))

const { minigameService } = await import("../src/minigame/service")

const source = (name: string) => ({
  id: "1",
  workspaceId: "ws-1",
  name,
  type: "jackpot",
  enabled: true,
  generalSettings: { name, showName: true },
  appearance: {
    backgroundColor: "#000000",
    backgroundImage: { mode: "url", url: "https://cdn.example/bg.png" },
    prizeDescriptionImage: {
      mode: "url",
      url: "https://cdn.example/prizes.png",
    },
  },
  playerSettings: { drawsPerPerson: 3 },
  prizeSettings: {
    prizes: [
      { id: "p1", name: "Voucher", icon: null, winRate: 30, quantity: 2 },
    ],
    nonWinning: { title: "Try again", loseRate: 70, loseImage: null },
    prizeNameCustomFieldId: "42",
  },
  winningMessageSettings: { enabled: true },
  nonWinningMessageSettings: { enabled: false },
  playsCount: 9,
  participantsCount: 5,
  winnersCount: 2,
  sharesCount: 1,
})

type InsertedValues = Record<string, unknown> & {
  name: string
  generalSettings: { name: string }
}

const inserted = () =>
  insertValues.mock.calls.map(([values]) => values as InsertedValues)

const uniqueViolation = new Error("duplicate key")

beforeEach(() => {
  vi.clearAllMocks()
  isUniqueViolationError.mockImplementation(
    (error: unknown) => error === uniqueViolation,
  )
  insertReturning.mockImplementation(async () => [{ id: "2" }])
})

describe("minigameService.duplicate", () => {
  test("copies settings but not prizes, prize image, plays, or counters, and starts disabled", async () => {
    findFirst.mockResolvedValue(source("Spin"))
    findMany.mockResolvedValue([])

    await minigameService.duplicate({ workspaceId: "ws-1", id: "1" })

    const [values] = inserted()
    expect(values).toEqual({
      workspaceId: "ws-1",
      enabled: false,
      name: "Spin - Copy",
      type: "jackpot",
      generalSettings: { name: "Spin - Copy", showName: true },
      appearance: {
        backgroundColor: "#000000",
        backgroundImage: { mode: "url", url: "https://cdn.example/bg.png" },
        prizeDescriptionImage: { mode: "file", url: "" },
      },
      playerSettings: { drawsPerPerson: 3 },
      prizeSettings: {
        prizes: [],
        nonWinning: { title: "Try again", loseRate: 100, loseImage: null },
        prizeNameCustomFieldId: "42",
      },
      winningMessageSettings: { enabled: true },
      nonWinningMessageSettings: { enabled: false },
    })
  })

  test("picks the first free copy name", async () => {
    findFirst.mockResolvedValue(source("X"))
    findMany.mockResolvedValue([{ name: "X - Copy" }, { name: "X - Copy 2" }])

    await minigameService.duplicate({ workspaceId: "ws-1", id: "1" })

    expect(inserted().map((values) => values.name)).toEqual(["X - Copy 3"])
  })

  test("tries the next free name when a parallel copy took it", async () => {
    findFirst.mockResolvedValue(source("X"))
    findMany.mockResolvedValue([])
    insertReturning.mockRejectedValueOnce(uniqueViolation)

    await minigameService.duplicate({ workspaceId: "ws-1", id: "1" })

    expect(inserted().map((values) => values.name)).toEqual([
      "X - Copy",
      "X - Copy 2",
    ])
  })

  test("reports a name conflict after the retry", async () => {
    findFirst.mockResolvedValue(source("X"))
    findMany.mockResolvedValue([])
    insertReturning.mockRejectedValue(uniqueViolation)

    await expect(
      minigameService.duplicate({ workspaceId: "ws-1", id: "1" }),
    ).rejects.toMatchObject({ code: "nameAlreadyExists" })
  })

  test("cuts a long name so the copy name fits 150 characters", async () => {
    findFirst.mockResolvedValue(source("a".repeat(150)))
    findMany.mockResolvedValue([])

    await minigameService.duplicate({ workspaceId: "ws-1", id: "1" })

    const [values] = inserted()
    expect(values?.name).toHaveLength(150)
    expect(values?.name.endsWith(" - Copy")).toBe(true)
    expect(values?.generalSettings.name).toBe(values?.name)
  })

  test("fails when the minigame is not in the workspace", async () => {
    findFirst.mockResolvedValue(undefined)

    await expect(
      minigameService.duplicate({ workspaceId: "ws-1", id: "1" }),
    ).rejects.toThrow("Minigame not found")
    expect(insertValues).not.toHaveBeenCalled()
  })

  test("holds the source's template lock and refuses a copy being uninstalled", async () => {
    findFirst.mockResolvedValue(source("X"))
    findMany.mockResolvedValue([])
    assertResourceEditable.mockRejectedValueOnce(new Error("uninstalling"))

    await expect(
      minigameService.duplicate({ workspaceId: "ws-1", id: "1" }),
    ).rejects.toThrow("uninstalling")

    expect(lockedTransaction).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      initialKeys: [{ kind: "minigame", resourceId: "1" }],
    })
    expect(assertResourceEditable).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceKind: "minigame",
        resourceIds: ["1"],
        changedKeys: [],
      }),
    )
    expect(insertValues).not.toHaveBeenCalled()
  })
})
