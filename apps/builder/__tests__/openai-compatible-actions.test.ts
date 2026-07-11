import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  findByWorkspaceIdAndId: vi.fn(),
  isDuplicatePreset: vi.fn(() => false),
  returnValidationErrors: vi.fn(
    (_schema: unknown, errors: Record<string, unknown>) => ({
      validationErrors: errors,
    }),
  ),
  update: vi.fn(),
  validateBaseUrl: vi.fn(),
  verifyProvider: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain }
})

vi.mock("@/features/common/schemas", () => ({
  workspaceIdAndIdRequestParams: [],
  workspaceIdrequestParams: [],
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationOpenaiCompatibleService: {
    connect: mocks.connect,
    findByWorkspaceIdAndId: mocks.findByWorkspaceIdAndId,
    update: mocks.update,
  },
  isOpenaiCompatiblePresetAlreadyConnectedError: mocks.isDuplicatePreset,
  validateOpenaiCompatibleBaseUrlForEnvironment: mocks.validateBaseUrl,
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code = "systemError"
    httpStatusCode = 400

    constructor(message: string, code?: string, httpStatusCode?: number) {
      super(message)
      this.name = "ChatbotXException"
      if (code) {
        this.code = code
      }
      if (httpStatusCode) {
        this.httpStatusCode = httpStatusCode
      }
    }
  },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock("next-safe-action", () => ({
  returnValidationErrors: mocks.returnValidationErrors,
}))

vi.mock("@/features/integration-openai-compatible/lib", () => ({
  verifyOpenaiCompatibleProvider: mocks.verifyProvider,
}))

const { ChatbotXException } = await import("@chatbotx.io/business/errors")
const { connectOpenaiCompatibleAction } = await import(
  "@/features/integration-openai-compatible/actions/connect.action"
)
const { updateOpenaiCompatibleAction } = await import(
  "@/features/integration-openai-compatible/actions/update.action"
)

type ActionHandler<TParsedInput, TBindArgs extends unknown[]> = (props: {
  parsedInput: TParsedInput
  bindArgsParsedInputs: TBindArgs
}) => Promise<unknown>

const baseInput = {
  apiKey: "secret",
  autoReply: false,
  baseURL: "https://example.com/v1",
  enabled: true,
  name: "Provider",
  preset: "custom",
}

describe("OpenAI-compatible actions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.validateBaseUrl.mockImplementation(async (baseURL: string) =>
      baseURL.trim(),
    )
    mocks.verifyProvider.mockResolvedValue({ ok: true })
    mocks.findByWorkspaceIdAndId.mockResolvedValue({
      auth: { authType: "secretText", secretText: "existing-key" },
      baseURL: "https://example.com/v1",
    })
  })

  test("connect maps unsafe base URL errors before provider verification", async () => {
    mocks.validateBaseUrl.mockRejectedValue(
      new ChatbotXException("blocked", "ssrfBlocked", 400),
    )

    const result = await (
      connectOpenaiCompatibleAction as unknown as ActionHandler<
        typeof baseInput,
        [string]
      >
    )({
      parsedInput: baseInput,
      bindArgsParsedInputs: ["workspace-1"],
    })

    expect(result).toEqual({
      validationErrors: {
        baseURL: {
          _errors: ["openaiCompatible.validation.invalidBaseURL"],
        },
      },
    })
    expect(mocks.verifyProvider).not.toHaveBeenCalled()
    expect(mocks.connect).not.toHaveBeenCalled()
  })

  test("update validates existing base URL before verifying an API key change", async () => {
    mocks.validateBaseUrl.mockRejectedValue(
      new ChatbotXException("blocked", "ssrfBlocked", 400),
    )

    const result = await (
      updateOpenaiCompatibleAction as unknown as ActionHandler<
        { apiKey: string },
        [string, string]
      >
    )({
      parsedInput: { apiKey: "new-key" },
      bindArgsParsedInputs: ["workspace-1", "integration-1"],
    })

    expect(mocks.findByWorkspaceIdAndId).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "integration-1",
    })
    expect(result).toEqual({
      validationErrors: {
        baseURL: {
          _errors: ["openaiCompatible.validation.invalidBaseURL"],
        },
      },
    })
    expect(mocks.verifyProvider).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
