import { aiTimeouts, isImageUrl, processStreamingText } from "@chatbotx.io/ai"
import type { AIAnalyzeImageSchema } from "@chatbotx.io/flow-config"
import { streamText } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import {
  readCustomFieldValue,
  saveResultToCustomField,
} from "../../utils/contact"
import type { ExecuteStepProps } from "../flow"
import { resolveFlowAIModel } from "../shared/flow-ai-model-resolver"
import type { ExecuteStepResult } from "../step"

export async function handleAIAnalyzeImage({
  conversation,
  step,
}: ExecuteStepProps<AIAnalyzeImageSchema>): Promise<ExecuteStepResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)

  try {
    const resolvedModel = await resolveFlowAIModel({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
      integrationId:
        step.provider === "openaiCompatible" ? step.integrationId : undefined,
      modelId: step.model,
      conversationId: conversation.id,
    })

    if (!resolvedModel.ok) {
      logger.warn(
        {
          workspaceId: conversation.workspaceId,
          conversationId: conversation.id,
          stepId: step.id,
          stepType: step.stepType,
          provider: step.provider,
          integrationId:
            step.provider === "openaiCompatible"
              ? step.integrationId
              : undefined,
          modelId: step.model,
          reason: resolvedModel.reason,
        },
        "[ai-analyze-image] Failed to resolve AI model",
      )
      return {
        status: "error",
        errorMessage: resolvedModel.message,
        result: null,
      }
    }

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
      model: resolvedModel.model,
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
