import { aiTimeouts, isImageUrl, processStreamingText } from "@chatbotx.io/ai"
import {
  aiIntegrationService,
  createAIModelInstance,
} from "@chatbotx.io/ai/server"
import type { AIAnalyzeImageSchema } from "@chatbotx.io/flow-config"
import { streamText } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import {
  readCustomFieldValue,
  saveResultToCustomField,
} from "../../utils/contact"
import type { ExecuteStepProps } from "../flow"
import type { ExecuteStepResult } from "../step"

export async function handleAIAnalyzeImage({
  conversation,
  step,
}: ExecuteStepProps<AIAnalyzeImageSchema>): Promise<ExecuteStepResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)

  try {
    const aiConfig = await aiIntegrationService.findBy({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    if (!aiConfig) {
      return {
        status: "error",
        errorMessage: "AI integration not found",
        result: null,
      }
    }

    const model = createAIModelInstance({
      model: aiConfig,
      provider: step.provider,
      modelId: step.model,
    })

    // Resolve Image URL
    const imageUrl = await readCustomFieldValue({
      contactId: conversation.contactId,
      customFieldId: step.inputFieldId,
    })
    if (!(imageUrl && isImageUrl(imageUrl))) {
      return {
        status: "error",
        errorMessage: "Invalid image URL provided",
        result: null,
      }
    }

    const result = streamText({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: step.prompt },
            { type: "image", image: imageUrl },
          ],
        },
      ],
      maxOutputTokens: step.maxOutputTokens,
      temperature: step.temperature,
      abortSignal: controller.signal,
    })

    const { fullText } = await processStreamingText(
      result.textStream,
      async () => {
        // noop: fullText is accumulated internally, no message to send
      },
      { sendParts: false },
    )

    if (step.outputFieldId) {
      await saveResultToCustomField({
        contactId: conversation.contactId,
        customFieldId: step.outputFieldId,
        fullText,
        workspaceId: conversation.workspaceId,
      })
    }

    return { status: "success", result: null }
  } catch (err) {
    const error = normalizeError(err)
    logger.error(error, "[ai-analyze-image] Step failed")
    return { status: "error", errorMessage: error.message, result: null }
  } finally {
    clearTimeout(timeoutId)
  }
}
