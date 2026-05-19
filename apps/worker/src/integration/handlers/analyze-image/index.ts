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
import { sendMessageWithRender } from "../../utils/message"
import type { ExecuteStepProps } from "../flow"

export async function handleAIAnalyzeImage({
  conversation,
  step,
}: ExecuteStepProps<AIAnalyzeImageSchema>) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)

  try {
    const aiConfig = await aiIntegrationService.findBy({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    if (!aiConfig) {
      return
    }

    const model = createAIModelInstance({
      model: aiConfig,
      provider: step.provider,
      modelId: step.model,
      abortSignal: controller.signal,
    })

    // Resolve Image URL
    const imageUrl = await readCustomFieldValue({
      contactId: conversation.contactId,
      customFieldId: step.inputFieldId,
    })
    if (!(imageUrl && isImageUrl(imageUrl))) {
      await sendMessageWithRender(conversation.id, "Invalid image URL provided")
      return
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
      async (_segment, parts) => {
        for (const part of parts) {
          await sendMessageWithRender(conversation.id, part)
        }
      },
      { sendParts: true },
    )

    if (step.outputFieldId) {
      await saveResultToCustomField({
        contactId: conversation.contactId,
        customFieldId: step.outputFieldId,
        fullText,
        workspaceId: conversation.workspaceId,
      })
    }
  } catch (error) {
    const parsedError = normalizeError(error)
    logger.error(parsedError, "[ai-analyze-image] Step failed")

    await sendMessageWithRender(conversation.id, "Error analyzing image")

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
