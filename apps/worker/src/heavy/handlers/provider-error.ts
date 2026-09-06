import { logProviderError } from "@chatbotx.io/business/error-log"
import { normalizeError } from "universal-error-normalizer"
import type { AIStepProvider } from "../../integration/handlers/shared/ai-error-log-provider"
import { aiErrorLogProvider } from "../../integration/handlers/shared/ai-error-log-provider"
import { logger } from "../../lib/logger"

export async function recordHeavyAIStepProviderError(input: {
  contactId: string
  error: unknown
  provider: AIStepProvider
  workspaceId: string
}): Promise<void> {
  try {
    await logProviderError({
      provider: aiErrorLogProvider(input.provider),
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      error: normalizeError(input.error),
    })
  } catch (error) {
    logger.warn(
      {
        err: normalizeError(error),
        provider: input.provider,
        workspaceId: input.workspaceId,
        contactId: input.contactId,
      },
      "Failed to persist heavy AI provider error",
    )
  }
}
