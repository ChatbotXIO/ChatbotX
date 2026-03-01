import { uploader } from "@aha.chat/filesystem"
import {
  type AIGenerateImageSchema,
  aiProviders,
  getAIGeneratedImagePath,
  IMAGE_AUTO_VALUE,
  IMAGE_BASE64_ENCODING,
  IMAGE_DEFAULT_EXTENSION,
  IMAGE_DEFAULT_MIME_TYPE,
  type ImageAspectRatioType,
} from "@aha.chat/flow-config"
import { createId } from "@paralleldrive/cuid2"
import { generateImage } from "ai"
import { getAIImageModel, getAIIntegrationInDB } from "../../../lib/ai"
import { logger } from "../../../lib/logger"
import { saveResultToCustomField } from "../contact"
import type { ExecuteStepProps } from "../flow"

export async function handleAIGenerateImage({
  conversation,
  step,
}: ExecuteStepProps<AIGenerateImageSchema>) {
  try {
    const aiConfig = await getAIIntegrationInDB({
      chatbotId: conversation.chatbotId,
      provider: step.provider,
    })

    const model = getAIImageModel(aiConfig, step.provider, step.model)

    const size =
      step.provider === aiProviders.openai && step.size !== IMAGE_AUTO_VALUE
        ? (step.size as `${number}x${number}`)
        : undefined

    const aspectRatio =
      step.provider === aiProviders.gemini && step.size !== IMAGE_AUTO_VALUE
        ? (step.size as ImageAspectRatioType)
        : undefined

    const { image } = await generateImage({
      model,
      prompt: step.prompt,
      size,
      aspectRatio,
    })

    let finalImageUrl = ""

    let buffer: Buffer | null = null
    if (image.base64) {
      buffer = Buffer.from(image.base64, IMAGE_BASE64_ENCODING)
    } else if (image.uint8Array) {
      buffer = Buffer.from(image.uint8Array)
    }

    if (buffer) {
      const contentType =
        (image as { mediaType?: string }).mediaType || IMAGE_DEFAULT_MIME_TYPE
      const extension = contentType.split("/")[1] || IMAGE_DEFAULT_EXTENSION
      const fileName = `${createId()}.${extension}`
      const storagePath = getAIGeneratedImagePath(
        conversation.chatbotId,
        fileName,
      )

      await uploader.putObject(storagePath, buffer, {
        ContentType: contentType,
      })

      const publicUrlBase =
        process.env.NEXT_PUBLIC_ASSET_URL || process.env.AWS_URL
      finalImageUrl = publicUrlBase
        ? new URL(storagePath, publicUrlBase).toString()
        : storagePath
    }

    if (finalImageUrl) {
      await saveResultToCustomField({
        contactId: conversation.contactId,
        customFieldId: step.outputCfId,
        fullText: finalImageUrl,
        messageCount: 1,
        chatbotId: conversation.chatbotId,
      })
    }
  } catch (error) {
    logger.error("[ai-generate-image] Step failed", {
      error,
      conversationId: conversation.id,
      stepId: step.id,
    })
    throw error
  }
}
