import {
  createOpenAICompatible,
  type OpenAICompatibleProviderSettings,
} from "@ai-sdk/openai-compatible"
import {
  MUSE_MAX_TEMPERATURE,
  MUSE_REASONING_HEADROOM_TOKENS,
} from "@chatbotx.io/flow-config"

export const MUSE_BASE_URL = "https://api.meta.ai/v1"

/**
 * Muse counts reasoning tokens against `max_tokens`. With the model's default
 * effort a short budget (e.g. the 250-token `aiGenerateText` default or the
 * 128-token handoff classifier) is spent entirely on reasoning and the reply
 * comes back empty. Below this budget the factory picks `minimal` effort.
 */
export const MUSE_LOW_BUDGET_THRESHOLD = 1024

export function transformMuseRequestBody(
  body: Record<string, unknown>,
): Record<string, unknown> {
  const maxTokens =
    typeof body.max_tokens === "number" ? body.max_tokens : undefined
  const next = { ...body }

  // The SDK always sets the key (value `undefined` when no effort is passed),
  // so check the value, not `"reasoning_effort" in body`.
  if (next.reasoning_effort == null) {
    next.reasoning_effort =
      maxTokens !== undefined && maxTokens < MUSE_LOW_BUDGET_THRESHOLD
        ? "minimal"
        : "low"
  }

  if (maxTokens !== undefined) {
    next.max_tokens = maxTokens + MUSE_REASONING_HEADROOM_TOKENS
  }

  // Step schemas reject a higher Muse temperature; the clamp still covers
  // agents and any caller that skips schema validation.
  if (
    typeof next.temperature === "number" &&
    next.temperature > MUSE_MAX_TEMPERATURE
  ) {
    next.temperature = MUSE_MAX_TEMPERATURE
  }

  // Muse rejects every `tool_choice` but "auto" with a 400. A forced choice
  // (named tool or "required") becomes "auto" so the call still runs — callers
  // already treat a missing tool call as no selection. "none" drops the tools.
  if (next.tool_choice === "none") {
    const { tools: _tools, tool_choice: _toolChoice, ...rest } = next
    return rest
  }
  if (next.tool_choice != null && next.tool_choice !== "auto") {
    next.tool_choice = "auto"
  }

  return next
}

export function createMuse(
  options: Pick<OpenAICompatibleProviderSettings, "apiKey" | "fetch"> = {},
) {
  return createOpenAICompatible({
    name: "muse",
    baseURL: MUSE_BASE_URL,
    apiKey: options.apiKey,
    fetch: options.fetch,
    includeUsage: true,
    supportsStructuredOutputs: true,
    transformRequestBody: transformMuseRequestBody,
  })
}
