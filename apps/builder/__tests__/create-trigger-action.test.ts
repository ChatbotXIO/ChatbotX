// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockCreate = vi.fn()
const mockGetTranslations = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  triggerService: { create: (...args: unknown[]) => mockCreate(...args) },
}))

class FakeChatbotXException extends Error {
  code: string
  field?: string
  data?: Record<string, string | number>
  constructor(
    message: string,
    code = "validation",
    field?: string,
    data?: Record<string, string | number>,
  ) {
    super(message)
    this.code = code
    this.field = field
    this.data = data
  }
}

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: FakeChatbotXException,
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  folderTypes: { enum: { trigger: "trigger" } },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: () => mockGetTranslations(),
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

vi.mock("../src/features/triggers/schema/mutation", () => ({
  createTriggerSchema: {},
}))

const { createTriggerAction: createTriggerActionUntyped } = await import(
  "../src/features/triggers/actions/create-trigger-action"
)
const createTriggerAction = createTriggerActionUntyped as unknown as (
  props: unknown,
) => Promise<unknown>

beforeEach(() => {
  vi.clearAllMocks()
  mockGetTranslations.mockResolvedValue(
    (key: string, params?: Record<string, unknown>) =>
      `${key}:${JSON.stringify(params)}`,
  )
})

describe("createTriggerAction", () => {
  test("delegates to triggerService.create with the resolved workspaceId and folderType", async () => {
    mockCreate.mockResolvedValue({ id: "trigger-1" })

    await createTriggerAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { name: "My trigger" },
    } as never)

    expect(mockCreate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      data: { name: "My trigger" },
      folderType: "trigger",
    })
  })

  test("localizes a maxItemsReached validation error via getTranslations", async () => {
    mockCreate.mockRejectedValue(
      new FakeChatbotXException(
        "validation.maxItemsReached",
        "validation",
        "_",
        { max: 50, feature: "triggers" },
      ),
    )

    await expect(
      createTriggerAction({
        bindArgsParsedInputs: ["ws-1"],
        parsedInput: { name: "My trigger" },
      } as never),
    ).rejects.toThrow(
      'validation.maxItemsReached:{"max":50,"feature":"triggers"}',
    )
  })

  test("re-throws non-validation errors without localizing", async () => {
    mockCreate.mockRejectedValue(new Error("boom"))

    await expect(
      createTriggerAction({
        bindArgsParsedInputs: ["ws-1"],
        parsedInput: { name: "My trigger" },
      } as never),
    ).rejects.toThrow("boom")

    expect(mockGetTranslations).not.toHaveBeenCalled()
  })
})
