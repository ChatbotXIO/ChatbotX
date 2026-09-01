import { logProviderError } from "@chatbotx.io/business/error-log"
import type { AITextToSpeechSchema } from "@chatbotx.io/flow-config"
import { normalizeError } from "universal-error-normalizer"
import { textToSpeechOutput } from "../../../heavy/handlers/text-to-speech"
import { logger } from "../../../lib/logger"
import type { ExecuteStepProps } from "../flow"
import { aiErrorLogProvider } from "../shared/ai-error-log-provider"
import type { ExecuteStepResult } from "../step"

export async function handleAITextToSpeech(
  props: ExecuteStepProps<AITextToSpeechSchema>,
): Promise<ExecuteStepResult> {
  const { conversation, step } = props

  try {
    const outputValue = await textToSpeechOutput(props)

    return { status: "success", result: { outputValue } }
  } catch (err) {
    const error = normalizeError(err)
    logger.error(
      {
        err: error,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
      },
      "[ai-text-to-speech] Step failed",
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
