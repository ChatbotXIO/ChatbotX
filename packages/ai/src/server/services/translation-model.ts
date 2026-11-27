import { integrationOpenaiCompatibleService } from "@chatbotx.io/business"
import {
  type AIAgentModelConfig,
  aiAgentModelConfig,
} from "@chatbotx.io/database/partials"
import type { LanguageModel } from "ai"
import { createAIModelInstance, getAIIntegrationInDB } from "../factory"
import { createOpenaiCompatibleModelInstance } from "../openai-compatible"

/**
 * The configured AI integration is missing, disabled, in another workspace, or
 * its credentials are unusable. Maps to the stored failure code
 * `integrationUnavailable` and to the "needs reconfiguration" settings status.
 */
export class TranslationIntegrationUnavailableError extends Error {
  readonly code = "integrationUnavailable"

  constructor(reason: string) {
    super(`translation-integration-unavailable: ${reason}`)
    this.name = "TranslationIntegrationUnavailableError"
  }
}

export type ResolvedTranslationModel = {
  model: LanguageModel
  /** `provider/model` or `openaiCompatible/model`, stored as `MessageTranslation.modelId`. */
  modelId: string
}

/**
 * Builds the language model Inbox translation calls, from the `modelConfig` an
 * admin saved on `InboxTranslationSettings` (the same shape an AI Agent stores).
 *
 * Unlike the AI-reply model, auto-reply scoping is not considered: a connection
 * used only for something else is still a valid translator. It revalidates on
 * every call (no FK from the settings to the integration), so a removed or
 * disabled integration surfaces here instead of at save time.
 */
export async function resolveTranslationModel(props: {
  workspaceId: string
  modelConfig: AIAgentModelConfig | null | undefined
}): Promise<ResolvedTranslationModel> {
  const { workspaceId } = props
  const parsed = aiAgentModelConfig.safeParse(props.modelConfig)
  if (!parsed.success) {
    throw new TranslationIntegrationUnavailableError("model not configured")
  }
  const config = parsed.data

  // The integration reads stay outside `buildModel`: a database or network
  // error there is transient and must reach the caller as itself (the job
  // retries it), not as an integration that can never work.
  if ("kind" in config) {
    const integration =
      await integrationOpenaiCompatibleService.findByWorkspaceIdAndId({
        workspaceId,
        id: config.integrationId,
      })
    if (!integration?.enabled) {
      throw new TranslationIntegrationUnavailableError(
        "openai-compatible integration missing or disabled",
      )
    }
    return {
      model: buildModel(() =>
        createOpenaiCompatibleModelInstance({
          integration,
          modelId: config.model,
        }),
      ),
      modelId: `openaiCompatible/${config.model}`,
    }
  }

  const integration = await getAIIntegrationInDB({
    workspaceId,
    provider: config.provider,
  })
  if (!integration) {
    throw new TranslationIntegrationUnavailableError(
      `no ${config.provider} integration`,
    )
  }
  return {
    model: buildModel(() =>
      createAIModelInstance({
        model: integration,
        provider: config.provider,
        modelId: config.model,
      }),
    ),
    modelId: `${config.provider}/${config.model}`,
  }
}

/**
 * Builds the model instance from a stored integration. It reads no database and
 * calls no network, so whatever it throws (unusable credentials, an unsupported
 * provider or model id) means the integration cannot be used as configured.
 */
function buildModel(create: () => LanguageModel): LanguageModel {
  try {
    return create()
  } catch (error) {
    throw new TranslationIntegrationUnavailableError(
      error instanceof Error ? error.message : "unusable integration",
    )
  }
}
