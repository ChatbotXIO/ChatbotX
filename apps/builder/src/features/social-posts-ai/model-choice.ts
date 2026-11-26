import {
  type AIAgentModelConfig,
  aiAgentProviders,
} from "@chatbotx.io/database/partials"

const OPENAI_COMPATIBLE_ID = /^\d{1,30}$/

/** A model choice as the request carries it: both fields, or neither. */
export type AiModelChoice = {
  integrationId: string
  model: string
}

/**
 * `integrationId` is a connected provider name (`openai`, `gemini`, `claude`,
 * `deepseek`, `openrouter`, `muse`: one integration per provider per workspace)
 * or the id of an OpenAI-compatible integration (digits).
 */
export const isAiIntegrationId = (value: string): boolean =>
  aiAgentProviders.safeParse(value).success || OPENAI_COMPATIBLE_ID.test(value)

/** The `modelConfig` a choice stands for, in the shape AI agents and translation store. */
export const modelConfigFromChoice = (
  choice: AiModelChoice,
): AIAgentModelConfig => {
  const provider = aiAgentProviders.safeParse(choice.integrationId)
  if (provider.success) {
    return { model: choice.model, provider: provider.data }
  }
  return {
    integrationId: choice.integrationId,
    kind: "openaiCompatible",
    model: choice.model,
  }
}
