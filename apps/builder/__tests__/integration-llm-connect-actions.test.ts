// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// The five LLM provider connect actions (Claude, DeepSeek, Gemini, OpenAI,
// OpenRouter) — thin wrappers that verify the API key via the shared
// tri-state `verifyAiProviderApiKey`, then delegate to the Connection
// domain's `connectionService.connectFromCredentials` (the same engine path
// `integrations/api/public/ai.ts`'s deprecated `PUT` route uses) and
// invalidate the AI cache. A second write path to the same rows the
// Connection engine also writes (each provider's own legacy
// `integrationClaudeService.connect`-style service, called directly) would
// cause 409 conflicts, so these actions delegate to the engine instead.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  connectFromCredentials: vi.fn(),
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

vi.mock("@chatbotx.io/connections", () => ({
  connectionService: { connectFromCredentials: mocks.connectFromCredentials },
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
// place, so each action's `verifyAiProviderApiKey`/`connectionService`
// imports resolve to the test doubles instead of the real implementations.
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
    expectedProviderArg: "claude",
    label: "Claude",
  },
  {
    action: () => connectDeepSeekAction,
    expectedProviderArg: "deepseek",
    label: "DeepSeek",
  },
  {
    action: () => connectGeminiAction,
    expectedProviderArg: "gemini",
    label: "Gemini",
  },
  {
    action: () => connectOpenAIAction,
    expectedProviderArg: "openai",
    label: "OpenAI",
  },
  {
    action: () => connectOpenRouterAction,
    expectedProviderArg: "openrouter",
    label: "OpenRouter",
  },
])("$label connect action", ({ action, expectedProviderArg }) => {
  test("returns a validation error and never calls connectFromCredentials when the key is invalid", async () => {
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
    expect(mocks.connectFromCredentials).not.toHaveBeenCalled()
    expect(mocks.invalidateCache).not.toHaveBeenCalled()
  })

  test("connects via connectFromCredentials (allowUpdate: true) then invalidates the AI cache for the right provider when the key is valid", async () => {
    mocks.verifyAiProviderApiKey.mockResolvedValue("valid")

    await (action() as unknown as ActionHandler<typeof baseInput, [string]>)({
      parsedInput: baseInput,
      bindArgsParsedInputs: [workspaceId],
    })

    expect(mocks.connectFromCredentials).toHaveBeenCalledWith({
      workspaceId,
      provider: expectedProviderArg,
      config: {
        apiKey: baseInput.apiKey,
        model: baseInput.model,
        temperature: baseInput.temperature,
        maxOutputTokens: baseInput.maxOutputTokens,
      },
      allowUpdate: true,
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

    expect(mocks.connectFromCredentials).toHaveBeenCalledWith({
      workspaceId,
      provider: expectedProviderArg,
      config: {
        apiKey: baseInput.apiKey,
        model: baseInput.model,
        temperature: baseInput.temperature,
        maxOutputTokens: baseInput.maxOutputTokens,
      },
      allowUpdate: true,
    })
    expect(mocks.invalidateCache).toHaveBeenCalledWith(
      workspaceId,
      expectedProviderArg,
    )
  })
})
