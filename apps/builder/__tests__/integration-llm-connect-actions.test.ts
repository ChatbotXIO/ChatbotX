import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// The five LLM provider connect actions (Claude, DeepSeek, Gemini, OpenAI,
// OpenRouter) — thin wrappers that verify the API key via the shared
// tri-state `verifyAiProviderApiKey`, then delegate to the provider's
// business-layer connect() and invalidate the AI cache. No db/schema
// imports remain in these actions.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  connectClaude: vi.fn(),
  connectDeepSeek: vi.fn(),
  connectGemini: vi.fn(),
  connectOpenAI: vi.fn(),
  connectOpenRouter: vi.fn(),
  invalidateCache: vi.fn(),
  returnValidationErrors: vi.fn(
    (_schema: unknown, errors: Record<string, unknown>) => ({
      validationErrors: errors,
    }),
  ),
  verifyAiProviderApiKey: vi.fn(),
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
  integrationOpenRouterService: { connect: mocks.connectOpenRouter },
}))

vi.mock("@chatbotx.io/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/ai")>()
  return {
    ...actual,
    aiProviders: {
      enum: {
        claude: "claude",
        deepseek: "deepseek",
        gemini: "gemini",
        openai: "openai",
        openrouter: "openrouter",
      },
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

vi.mock("@chatbotx.io/business/integration-ai-provider/verify", () => ({
  verifyAiProviderApiKey: mocks.verifyAiProviderApiKey,
}))
// Dynamic imports are required here (not a static-import violation): the
// action modules must load *after* the vi.mock registrations above are in
// place, so each action's `verifyAiProviderApiKey`/service imports resolve
// to the test doubles instead of the real implementations.
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
const { connectOpenRouterAction } = await import(
  "@/features/integration-openrouter/actions/connect.action"
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
  },
  {
    action: () => connectDeepSeekAction,
    connect: mocks.connectDeepSeek,
    expectedProviderArg: "deepseek",
    label: "DeepSeek",
  },
  {
    action: () => connectGeminiAction,
    connect: mocks.connectGemini,
    expectedProviderArg: "gemini",
    label: "Gemini",
  },
  {
    action: () => connectOpenAIAction,
    connect: mocks.connectOpenAI,
    expectedProviderArg: "openai",
    label: "OpenAI",
  },
  {
    action: () => connectOpenRouterAction,
    connect: mocks.connectOpenRouter,
    expectedProviderArg: "openrouter",
    label: "OpenRouter",
  },
])("$label connect action", ({ action, connect, expectedProviderArg }) => {
  test("returns a validation error and never calls connect when the key is invalid", async () => {
    mocks.verifyAiProviderApiKey.mockResolvedValue("invalid")

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
    mocks.verifyAiProviderApiKey.mockResolvedValue("valid")

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

  test("connects then invalidates the AI cache for the right provider when the verification is inconclusive", async () => {
    mocks.verifyAiProviderApiKey.mockResolvedValue("unknown")

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
