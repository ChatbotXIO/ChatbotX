import { db } from "@aha.chat/database/client"
import { reservedCustomFieldNames } from "@aha.chat/database/types"
import type { AIAnalyzeImageSchema } from "@aha.chat/flow-config"
import { streamText } from "ai"
import ky from "ky"
import { createAIModelInstance, getAIIntegrationInDB } from "../../../lib/ai"
import { logger } from "../../../lib/logger"
import { processStreamingText } from "../automated-response/text"
import type { ExecuteStepProps } from "../flow"
import { saveResultToCustomField } from "../generate-text"

export async function handleAIAnalyzeImage({
  conversation,
  step,
}: ExecuteStepProps<AIAnalyzeImageSchema>) {
  logger.info(
    {
      conversationId: conversation.id,
      stepId: step.id,
      stepType: step.stepType,
    },
    "[ai-analyze-image] Starting AI analyze image step",
  )
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  try {
    const aiConfig = await getAIIntegrationInDB({
      chatbotId: conversation.chatbotId,
      provider: step.provider,
    })

    if (!aiConfig) {
      logger.warn(
        {
          conversationId: conversation.id,
          stepId: step.id,
          provider: step.provider,
        },
        "[ai-analyze-image] AI configuration not found",
      )
      return
    }

    logger.info(
      {
        conversationId: conversation.id,
        stepId: step.id,
        model: step.model,
      },
      "[ai-analyze-image] AI configuration resolved",
    )

    const model = createAIModelInstance({
      model: aiConfig,
      provider: step.provider,
      modelId: step.model,
      abortSignal: controller.signal,
      traceId: conversation.id,
    })

    // Resolve Image URL from selected custom field or direct URL
    const imageUrl = await resolveImageUrl(step.imageUrl, conversation.id)
    if (!imageUrl) {
      logger.warn(
        {
          conversationId: conversation.id,
          stepId: step.id,
          inputImageUrl: step.imageUrl,
        },
        "[ai-analyze-image] No image URL found",
      )
      return
    }

    const isValidImageUrl = await validateImageUrl(imageUrl, conversation.id)
    if (!isValidImageUrl) {
      logger.warn(
        {
          conversationId: conversation.id,
          stepId: step.id,
          imageUrl,
        },
        "[ai-analyze-image] Resolved URL is not a valid image URL",
      )
      return
    }

    logger.info(
      {
        conversationId: conversation.id,
        stepId: step.id,
        imageUrl,
      },
      "[ai-analyze-image] Image URL resolved",
    )

    logger.info(
      {
        conversationId: conversation.id,
        stepId: step.id,
        prompt: step.prompt,
      },
      "[ai-analyze-image] Starting AI stream text",
    )

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

    logger.info(
      {
        conversationId: conversation.id,
        stepId: step.id,
        messageCount,
        fullTextLength: fullText.length,
      },
      "[ai-analyze-image] AI streaming text processed",
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

    logger.info(
      {
        conversationId: conversation.id,
        stepId: step.id,
        outputCfId: step.outputCfId,
      },
      "[ai-analyze-image] Result saved to custom field",
    )
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
const IMAGE_EXTENSION_REGEX =
  /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)(?:[?#].*)?$/i
const DATA_IMAGE_REGEX = /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/

function sanitizeInputValue(value: string): string {
  return value.replace(/<[^>]*>/g, "").trim()
}

function isHttpUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value)
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:"
  } catch {
    return false
  }
}

async function resolveImageUrl(
  value: string,
  conversationId: string,
): Promise<string | null> {
  logger.info(
    {
      conversationId,
      inputValue: value,
    },
    "[ai-analyze-image:resolveImageUrl] Starting to resolve image URL",
  )
  const cleanValue = sanitizeInputValue(value)
  if (!cleanValue) {
    logger.warn(
      {
        conversationId,
        inputValue: value,
      },
      "[ai-analyze-image:resolveImageUrl] Empty image URL value",
    )
    return null
  }

  // Backward compatibility: old configs may store direct URL here.
  if (isHttpUrl(cleanValue) || DATA_IMAGE_REGEX.test(cleanValue)) {
    logger.info(
      {
        conversationId,
        imageUrl: cleanValue,
      },
      "[ai-analyze-image:resolveImageUrl] Value is a direct URL",
    )
    return cleanValue
  }

  // If it's a variable {{variable_name}}
  const match = cleanValue.match(VARIABLE_REGEX)
  const fieldName = match ? match[1] || match[2] : cleanValue

  logger.info(
    {
      conversationId,
      fieldName,
    },
    "[ai-analyze-image:resolveImageUrl] Searching for variable in contact custom fields",
  )

  try {
    const conversation = await db.query.conversationModel.findFirst({
      where: { id: conversationId },
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
      logger.warn(
        {
          conversationId,
        },
        "[ai-analyze-image:resolveImageUrl] Conversation or contact not found",
      )
      return null
    }

    if (cleanValue === reservedCustomFieldNames.avatar) {
      const avatarUrl = sanitizeInputValue(conversation.contact.avatar || "")
      if (!avatarUrl) {
        logger.warn(
          {
            conversationId,
            fieldName: cleanValue,
          },
          "[ai-analyze-image:resolveImageUrl] Reserved avatar field is empty",
        )
        return null
      }

      logger.info(
        {
          conversationId,
          fieldName: cleanValue,
          resolvedValue: avatarUrl,
        },
        "[ai-analyze-image:resolveImageUrl] Resolved image from reserved avatar field",
      )
      return avatarUrl
    }

    for (const cf of conversation.contact.contactCustomFields) {
      if (
        cf.customField?.name === fieldName ||
        cf.customFieldId === fieldName
      ) {
        const resolvedValue = sanitizeInputValue(cf.value || "")
        if (!resolvedValue) {
          logger.warn(
            {
              conversationId,
              fieldName,
            },
            "[ai-analyze-image:resolveImageUrl] Custom field exists but has empty value",
          )
          return null
        }

        logger.info(
          {
            conversationId,
            fieldName,
            resolvedValue,
          },
          "[ai-analyze-image:resolveImageUrl] Variable resolved from custom field",
        )
        return resolvedValue
      }
    }

    logger.warn(
      {
        conversationId,
        fieldName,
      },
      "[ai-analyze-image:resolveImageUrl] Variable not found in custom fields",
    )
    return null
  } catch (error) {
    logger.error(
      { error, conversationId },
      "[ai-analyze-image:resolveImageUrl] Failed to resolve image URL variable",
    )
    return null
  }
}

async function validateImageUrl(
  value: string,
  conversationId: string,
): Promise<boolean> {
  const cleanValue = sanitizeInputValue(value)
  if (!cleanValue) {
    return false
  }

  if (DATA_IMAGE_REGEX.test(cleanValue)) {
    return true
  }

  if (!isHttpUrl(cleanValue)) {
    return false
  }

  try {
    const response = await ky.head(cleanValue, {
      throwHttpErrors: false,
      timeout: 8000,
      retry: 0,
    })

    const contentType =
      response.headers.get("content-type")?.toLowerCase() || ""
    if (contentType.startsWith("image/")) {
      return true
    }

    if (response.status === 405 || !contentType) {
      return IMAGE_EXTENSION_REGEX.test(cleanValue)
    }

    return false
  } catch (error) {
    logger.warn(
      {
        conversationId,
        imageUrl: cleanValue,
        error,
      },
      "[ai-analyze-image:validateImageUrl] Could not verify content-type, fallback to extension check",
    )
    return IMAGE_EXTENSION_REGEX.test(cleanValue)
  }
}
