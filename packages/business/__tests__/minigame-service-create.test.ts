import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  insertValues,
  insertReturning,
  assertReferencable,
  lockedTransaction,
  isUniqueViolationError,
} = vi.hoisted(() => ({
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  assertReferencable: vi.fn(),
  lockedTransaction: vi.fn(),
  isUniqueViolationError: vi.fn(),
}))

const insertClient = (label: string) => ({
  insert: vi.fn(() => ({
    values: (values: unknown) => {
      insertValues(label, values)
      return { returning: insertReturning }
    },
  })),
})
const tx = insertClient("tx")

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  db: insertClient("db"),
  eq: vi.fn(),
  ilike: vi.fn(),
  inArray: vi.fn(),
  isUniqueViolationError,
}))
vi.mock("@chatbotx.io/database/schema", () => ({ minigameModel: {} }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  minigameRepository: {},
}))
vi.mock("../src/template/installed-resource.service", () => ({
  assertReferencable,
  assertResourceEditable: vi.fn(),
  changedKeysOf: vi.fn(),
  withDeleteGuard: vi.fn(),
}))
vi.mock("../src/template/template-resource-locks", () => ({
  withTemplateLockedTransaction: async (
    run: (tx: unknown) => unknown,
    options: unknown,
  ) => {
    lockedTransaction(options)
    return await run(tx)
  },
}))

const { minigameService } = await import("../src/minigame/service")

type CreateInput = Parameters<typeof minigameService.create>[0]

const input = (overrides: Record<string, unknown> = {}): CreateInput =>
  ({
    workspaceId: "ws-1",
    type: "jackpot",
    generalSettings: { name: "Spin" },
    appearance: {},
    playerSettings: {},
    prizeSettings: { prizes: [] },
    winningMessageSettings: {},
    nonWinningMessageSettings: {},
    ...overrides,
  }) as unknown as CreateInput

beforeEach(() => {
  vi.clearAllMocks()
  insertReturning.mockResolvedValue([{ id: "1" }])
  isUniqueViolationError.mockReturnValue(false)
})

describe("minigameService.create", () => {
  test("takes no lock when the settings point at no flow", async () => {
    await minigameService.create(input())

    expect(lockedTransaction).not.toHaveBeenCalled()
    expect(assertReferencable).not.toHaveBeenCalled()
    expect(insertValues).toHaveBeenCalledWith("db", expect.anything())
  })

  test("locks and checks the flows its settings reference, then inserts in that transaction", async () => {
    await minigameService.create(
      input({
        playerSettings: { sharingFlowId: "f1" },
        winningMessageSettings: {
          outcomeMessage: { enabled: true, mode: "flow", flowId: "f2" },
        },
      }),
    )

    const parents = [
      { kind: "flow", resourceId: "f1" },
      { kind: "flow", resourceId: "f2" },
    ]
    expect(lockedTransaction).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      initialKeys: parents,
    })
    expect(assertReferencable).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      parents,
      tx,
    })
    expect(insertValues).toHaveBeenCalledWith("tx", expect.anything())
  })

  test("refuses without inserting when a referenced flow is being uninstalled", async () => {
    assertReferencable.mockRejectedValueOnce(new Error("uninstalling"))

    await expect(
      minigameService.create(
        input({ playerSettings: { sharingFlowId: "f1" } }),
      ),
    ).rejects.toThrow("uninstalling")
    expect(insertValues).not.toHaveBeenCalled()
  })
})
