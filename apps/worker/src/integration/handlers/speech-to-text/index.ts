import { logProviderError } from "@chatbotx.io/business/error-log"
import type { AISpeechToTextSchema } from "@chatbotx.io/flow-config"
import { normalizeError } from "universal-error-normalizer"
import { speechToTextOutput } from "../../../heavy/handlers/speech-to-text"
import { logger } from "../../../lib/logger"
import type { ExecuteStepProps } from "../flow"
import { aiErrorLogProvider } from "../shared/ai-error-log-provider"
import type { ExecuteStepResult } from "../step"

export async function handleAISpeechToText(
  props: ExecuteStepProps<AISpeechToTextSchema>,
): Promise<ExecuteStepResult> {
  const { conversation, step } = props

  try {
    const outputValue = await speechToTextOutput(props)

    return { status: "success", result: { outputValue } }
  } catch (err) {
    const error = normalizeError(err)
    logger.error(
      {
        err: error,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
      },
      "[ai-speech-to-text] Step failed",
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
