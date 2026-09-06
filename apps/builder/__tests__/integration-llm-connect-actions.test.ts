import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// The four LLM provider connect actions (Claude, DeepSeek, Gemini, OpenAI) —
// thin wrappers that verify the API key, then delegate to the provider's
// business-layer connect() and invalidate the AI cache. No db/schema
// imports remain in these actions.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  connectClaude: vi.fn(),
  connectDeepSeek: vi.fn(),
  connectGemini: vi.fn(),
  connectOpenAI: vi.fn(),
  invalidateCache: vi.fn(),
  returnValidationErrors: vi.fn(
    (_schema: unknown, errors: Record<string, unknown>) => ({
      validationErrors: errors,
    }),
  ),
  verifyClaudeApiKey: vi.fn(),
  verifyDeepSeekApiKey: vi.fn(),
  verifyGeminiApiKey: vi.fn(),
  verifyOpenAIApiKey: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => {
  const chain: Record<string, unknown> = {}
  chain.bindArgsSchemas = () => chain
  chain.inputSchema = () => chain
  chain.action = (fn: unknown) => fn
  return { workspaceActionClient: chain, authActionClient: chain }
})

vi.mock("@/features/common/schema", () => ({
  workspaceIdrequestParams: [],
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationClaudeService: { connect: mocks.connectClaude },
  integrationDeepSeekService: { connect: mocks.connectDeepSeek },
  integrationGeminiService: { connect: mocks.connectGemini },
  integrationOpenAIService: { connect: mocks.connectOpenAI },
}))

vi.mock("@chatbotx.io/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/ai")>()
  return {
    ...actual,
    aiProviders: {
      enum: { claude: "claude", deepseek: "deepseek", openai: "openai" },
    },
  }
})

vi.mock("@chatbotx.io/ai/server", () => ({
  aiIntegrationService: { invalidateCache: mocks.invalidateCache },
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock("next-safe-action", () => ({
  returnValidationErrors: mocks.returnValidationErrors,
}))

vi.mock("../src/features/integration-claude/lib", () => ({
  verifyClaudeApiKey: mocks.verifyClaudeApiKey,
}))
vi.mock("../src/features/integration-deepseek/lib", () => ({
  verifyDeepSeekApiKey: mocks.verifyDeepSeekApiKey,
}))
vi.mock("../src/features/integration-gemini/lib", () => ({
  verifyGeminiApiKey: mocks.verifyGeminiApiKey,
}))
vi.mock("../src/features/integration-openai/lib", () => ({
  verifyOpenAIApiKey: mocks.verifyOpenAIApiKey,
}))

const { connectClaudeAction } = await import(
  "@/features/integration-claude/actions/connect.action"
)
const { connectDeepSeekAction } = await import(
  "@/features/integration-deepseek/actions/connect.action"
)
const { connectGeminiAction } = await import(
  "@/features/integration-gemini/actions/connect.action"
)
const { connectOpenAIAction } = await import(
  "@/features/integration-openai/actions/connect.action"
)

type ActionHandler<TParsedInput, TBindArgs extends unknown[]> = (props: {
  parsedInput: TParsedInput
  bindArgsParsedInputs: TBindArgs
}) => Promise<unknown>

const workspaceId = "workspace-1"

const baseInput = {
  apiKey: "secret-key",
  model: "some-model",
  temperature: 0.4,
  maxOutputTokens: 1024,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe.each([
  {
    action: () => connectClaudeAction,
    connect: mocks.connectClaude,
    expectedProviderArg: "claude",
    label: "Claude",
    verify: mocks.verifyClaudeApiKey,
  },
  {
    action: () => connectDeepSeekAction,
    connect: mocks.connectDeepSeek,
    expectedProviderArg: "deepseek",
    label: "DeepSeek",
    verify: mocks.verifyDeepSeekApiKey,
  },
  {
    action: () => connectGeminiAction,
    connect: mocks.connectGemini,
    expectedProviderArg: "gemini",
    label: "Gemini",
    verify: mocks.verifyGeminiApiKey,
  },
  {
    action: () => connectOpenAIAction,
    connect: mocks.connectOpenAI,
    expectedProviderArg: "openai",
    label: "OpenAI",
    verify: mocks.verifyOpenAIApiKey,
  },
])("$label connect action", ({
  action,
  connect,
  expectedProviderArg,
  verify,
}) => {
  test("returns a validation error and never calls connect when the key is invalid", async () => {
    verify.mockResolvedValue(false)

    const result = await (
      action() as unknown as ActionHandler<typeof baseInput, [string]>
    )({
      parsedInput: baseInput,
      bindArgsParsedInputs: [workspaceId],
    })

    expect(result).toEqual({
      validationErrors: {
        apiKey: { _errors: ["validation.invalidApiKey"] },
      },
    })
    expect(connect).not.toHaveBeenCalled()
    expect(mocks.invalidateCache).not.toHaveBeenCalled()
  })

  test("connects then invalidates the AI cache for the right provider when the key is valid", async () => {
    verify.mockResolvedValue(true)

    await (action() as unknown as ActionHandler<typeof baseInput, [string]>)({
      parsedInput: baseInput,
      bindArgsParsedInputs: [workspaceId],
    })

    expect(connect).toHaveBeenCalledWith({
      workspaceId,
      apiKey: baseInput.apiKey,
      model: baseInput.model,
      temperature: baseInput.temperature,
      maxOutputTokens: baseInput.maxOutputTokens,
    })
    expect(mocks.invalidateCache).toHaveBeenCalledWith(
      workspaceId,
      expectedProviderArg,
    )
  })
})
