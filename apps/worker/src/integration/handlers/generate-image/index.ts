import { logProviderError } from "@chatbotx.io/business/error-log"
import type { AIGenerateImageSchema } from "@chatbotx.io/flow-config"
import { normalizeError } from "universal-error-normalizer"
import { generateImageOutput } from "../../../heavy/handlers/generate-image"
import { logger } from "../../../lib/logger"
import type { ExecuteStepProps } from "../flow"
import { aiErrorLogProvider } from "../shared/ai-error-log-provider"
import type { ExecuteStepResult } from "../step"

export async function handleAIGenerateImage(
  props: ExecuteStepProps<AIGenerateImageSchema>,
): Promise<ExecuteStepResult> {
  const { conversation, step } = props

  try {
    const outputValue = await generateImageOutput(props)

    return { status: "success", result: { outputValue } }
  } catch (err) {
    const error = normalizeError(err)
    logger.error(
      {
        err: error,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
      },
      "[ai-generate-image] Step failed",
    )
    await logProviderError({
      provider: aiErrorLogProvider(step.provider),
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      error: err,
    })
    return { status: "error", errorMessage: error.message, result: null }
  }
}
