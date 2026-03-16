import { db } from "@aha.chat/database/client"
import type { AIAnalyzeImageSchema } from "@aha.chat/flow-config"
import { streamText } from "ai"
import { createAIModelInstance, getAIIntegrationInDB } from "../../../lib/ai"
import { logger } from "../../../lib/logger"
import { processStreamingText } from "../automated-response/text"
import type { ExecuteStepProps } from "../flow"
import { saveResultToCustomField } from "../generate-text"

export async function handleAIAnalyzeImage({
  conversation,
  step,
}: ExecuteStepProps<AIAnalyzeImageSchema>) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  try {
    const aiConfig = await getAIIntegrationInDB({
      chatbotId: conversation.chatbotId,
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
      traceId: conversation.id,
    })

    // Resolve Image URL
    const imageUrl = await resolveImageUrl(step.imageUrl, conversation.id)
    if (!imageUrl) {
      logger.warn(
        {
          conversationId: conversation.id,
          stepId: step.id,
        },
        "[ai-analyze-image] No image URL found",
      )
      return
    }

    const result = streamText({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: step.prompt || "What's in this image?" },
            { type: "image", image: imageUrl },
          ],
        },
      ],
      maxOutputTokens: step.maxOutputTokens,
      temperature: step.temperature,
      abortSignal: controller.signal,
    })

    const { messageCount, fullText } = await processStreamingText(
      result.textStream,
      conversation,
      { sendParts: true },
    )

    await saveResultToCustomField({
      contactId: conversation.contactId,
      customFieldId: step.outputCfId,
      fullText,
      messageCount,
      chatbotId: conversation.chatbotId,
      model,
      abortSignal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      logger.warn(
        {
          conversationId: conversation.id,
          stepId: step.id,
        },
        "[ai-analyze-image] Step timed out or aborted",
      )
    } else {
      logger.error(
        {
          error,
          conversationId: conversation.id,
          stepId: step.id,
          stepType: step.stepType,
        },
        "[ai-analyze-image] Step failed",
      )
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

const VARIABLE_REGEX = /^\{\{(.+)\}\}$|^\s*(.+)\s*$/

async function resolveImageUrl(
  value: string,
  conversationId: string,
): Promise<string | null> {
  // Tiptap returns HTML, so we strip tags first
  const cleanValue = value.replace(/<[^>]*>/g, "").trim()
  if (!cleanValue) {
    return null
  }

  // If it's already a URL
  if (cleanValue.startsWith("http")) {
    return cleanValue
  }

  // If it's a variable {{variable_name}}
  const match = cleanValue.match(VARIABLE_REGEX)
  const fieldName = match ? match[1] || match[2] : cleanValue

  try {
    const conversation = await db.query.conversationModel.findFirst({
      where: (table, { eq }) => eq(table.id, conversationId),
      with: {
        contact: {
          with: {
            contactCustomFields: {
              with: {
                customField: true,
              },
            },
          },
        },
      },
    })

    if (!conversation?.contact) {
      return null
    }

    for (const cf of conversation.contact.contactCustomFields) {
      if (
        cf.customField?.name === fieldName ||
        cf.customFieldId === fieldName
      ) {
        return cf.value || null
      }
    }

    return null
  } catch (error) {
    logger.error(
      { error, conversationId },
      "Failed to resolve image URL variable",
    )
    return null
  }
}
