// @vitest-environment node
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockReturnValidationErrors = vi.fn(
  (_schema: unknown, errors: unknown) => ({ validationErrors: errors }),
)

vi.mock("@chatbotx.io/business/minigame", () => ({
  minigameService: {
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}))

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("@/lib/safe-action", () => ({
  workspaceActionClient: {
    bindArgsSchemas: () => ({
      inputSchema: () => ({ action: (fn: unknown) => fn }),
    }),
  },
}))

vi.mock("next-safe-action", () => ({
  returnValidationErrors: (schema: unknown, errors: unknown) =>
    mockReturnValidationErrors(schema, errors),
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock("../src/features/minigames/schema/action", () => ({
  createMinigameRequest: {},
  updateMinigameRequest: {},
}))

const { createMinigameAction: createMinigameActionUntyped } = await import(
  "../src/features/minigames/actions/create-minigame.action"
)
const { updateMinigameAction: updateMinigameActionUntyped } = await import(
  "../src/features/minigames/actions/update-minigame.action"
)
const createMinigameAction = createMinigameActionUntyped as unknown as (
  props: unknown,
) => Promise<unknown>
const updateMinigameAction = updateMinigameActionUntyped as unknown as (
  props: unknown,
) => Promise<unknown>

const minigameInput = {
  type: "jackpot",
  generalSettings: { name: "Prize game" },
  appearance: {},
  playerSettings: {},
  prizeSettings: { prizes: [] },
  winningMessageSettings: {},
  nonWinningMessageSettings: {},
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("createMinigameAction — name conflict mapping", () => {
  test("maps a nameAlreadyExists ChatbotXException to an inline form validation error, not a thrown 500", async () => {
    mockCreate.mockRejectedValueOnce(
      new ChatbotXException(
        "Minigame name already exists",
        "nameAlreadyExists",
        409,
      ),
    )

    const result = await createMinigameAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: minigameInput,
    })

    expect(mockReturnValidationErrors).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        generalSettings: expect.objectContaining({
          name: expect.objectContaining({
            _errors: expect.any(Array),
          }),
        }),
      }),
    )
    expect(result).toEqual({
      validationErrors: expect.objectContaining({
        generalSettings: expect.anything(),
      }),
    })
  })

  test("rethrows an unrelated error instead of swallowing it", async () => {
    mockCreate.mockRejectedValueOnce(new Error("boom"))

    await expect(
      createMinigameAction({
        bindArgsParsedInputs: ["ws-1"],
        parsedInput: minigameInput,
      }),
    ).rejects.toThrow("boom")

    expect(mockReturnValidationErrors).not.toHaveBeenCalled()
  })
})

describe("updateMinigameAction — name conflict mapping", () => {
  test("maps a nameAlreadyExists ChatbotXException to an inline form validation error, not a thrown 500", async () => {
    mockUpdate.mockRejectedValueOnce(
      new ChatbotXException(
        "Minigame name already exists",
        "nameAlreadyExists",
        409,
      ),
    )

    await updateMinigameAction({
      bindArgsParsedInputs: ["ws-1", "minigame-1", {}],
      parsedInput: minigameInput,
    })

    expect(mockReturnValidationErrors).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        generalSettings: expect.objectContaining({
          name: expect.objectContaining({
            _errors: expect.any(Array),
          }),
        }),
      }),
    )
  })

  test("rethrows an unrelated error instead of swallowing it", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("boom"))

    await expect(
      updateMinigameAction({
        bindArgsParsedInputs: ["ws-1", "minigame-1", {}],
        parsedInput: minigameInput,
      }),
    ).rejects.toThrow("boom")

    expect(mockReturnValidationErrors).not.toHaveBeenCalled()
  })
})
