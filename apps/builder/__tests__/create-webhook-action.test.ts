// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mockCreate = vi.fn()
const mockGetTranslations = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  webhookService: { create: (...args: unknown[]) => mockCreate(...args) },
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
  folderTypes: { enum: { webhook: "webhook" } },
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

vi.mock("../src/features/webhooks/schema/create-webhook-schema", () => ({
  createWebhookSchema: {},
}))

const { createWebhookAction: createWebhookActionUntyped } = await import(
  "../src/features/webhooks/actions/create-webhook-action"
)
const createWebhookAction = createWebhookActionUntyped as unknown as (
  props: unknown,
) => Promise<unknown>

beforeEach(() => {
  vi.clearAllMocks()
  mockGetTranslations.mockResolvedValue(
    (key: string, params?: Record<string, unknown>) =>
      `${key}:${JSON.stringify(params)}`,
  )
})

describe("createWebhookAction", () => {
  test("delegates to webhookService.create with the resolved workspaceId and folderType", async () => {
    mockCreate.mockResolvedValue({ id: "webhook-1", name: "New Order" })

    const result = await createWebhookAction({
      bindArgsParsedInputs: ["ws-1"],
      parsedInput: { name: "New Order", folderId: null },
    } as never)

    expect(mockCreate).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      data: { name: "New Order", folderId: null },
      folderType: "webhook",
    })
    expect(result).toEqual({ id: "webhook-1", name: "New Order" })
  })

  test("localizes a maxItemsReached validation error via getTranslations", async () => {
    mockCreate.mockRejectedValue(
      new FakeChatbotXException(
        "validation.maxItemsReached",
        "validation",
        "_",
        { max: 100, feature: "webhooks" },
      ),
    )

    await expect(
      createWebhookAction({
        bindArgsParsedInputs: ["ws-1"],
        parsedInput: { name: "New Order", folderId: null },
      } as never),
    ).rejects.toThrow(
      'validation.maxItemsReached:{"max":100,"feature":"webhooks"}',
    )
  })

  test("re-throws non-validation errors without localizing", async () => {
    mockCreate.mockRejectedValue(new Error("boom"))

    await expect(
      createWebhookAction({
        bindArgsParsedInputs: ["ws-1"],
        parsedInput: { name: "New Order", folderId: null },
      } as never),
    ).rejects.toThrow("boom")

    expect(mockGetTranslations).not.toHaveBeenCalled()
  })
})
