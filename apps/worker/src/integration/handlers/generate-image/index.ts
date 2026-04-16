import { aiProviders, aiTimeouts } from "@chatbotx.io/ai"
import {
  aiIntegrationService,
  createAIImageModelInstance,
} from "@chatbotx.io/ai/server"
import { db } from "@chatbotx.io/database/client"
import { getPublicUrl } from "@chatbotx.io/database/utils"
import { getStoragePrefix, uploader } from "@chatbotx.io/filesystem"
import {
  type AIGenerateImageSchema,
  getAIGeneratedImagePath,
  IMAGE_AUTO_VALUE,
  IMAGE_BASE64_ENCODING,
  IMAGE_DEFAULT_EXTENSION,
  IMAGE_DEFAULT_MIME_TYPE,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { generateImage, type ImageModel } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import { integrationService } from "../../../services/integrations"
import { saveResultToCustomField } from "../../utils/contact"
import { sendMessageWithRender } from "../../utils/message"
import type { ExecuteStepProps } from "../flow"

export async function handleAIGenerateImage({
  conversation,
  contactInbox: baseContactInbox,
  step,
}: ExecuteStepProps<AIGenerateImageSchema>) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)

  try {
    const contactInbox =
      baseContactInbox ||
      (await db.query.contactInboxModel.findFirst({
        where: {
          contactId: conversation.contactId,
        },
        orderBy: {
          lastMessageAt: "desc",
        },
      }))

    if (!contactInbox) {
      return
    }

    const auth =
      await integrationService.getIntegrationAuthFromContactInbox(contactInbox)

    const ctx = {
      storagePrefix: getStoragePrefix(
        conversation.workspaceId,
        contactInbox.inboxId,
      ),
      auth,
      uploader,
    }

    const aiConfig = await aiIntegrationService.findBy({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    if (!aiConfig) {
      return
    }

    const model = createAIImageModelInstance({
      model: aiConfig,
      provider: step.provider,
      modelId: step.model,
      abortSignal: controller.signal,
    }) as ImageModel

    const size =
      step.provider === aiProviders.enum.openai &&
      step.size !== IMAGE_AUTO_VALUE
        ? (step.size as `${number}x${number}`)
        : undefined

    const aspectRatio =
      step.provider === aiProviders.enum.gemini &&
      step.size !== IMAGE_AUTO_VALUE
        ? (step.size as `${number}:${number}`)
        : undefined

    const { image } = await generateImage({
      model,
      prompt: step.prompt,
      size,
      aspectRatio,
      abortSignal: controller.signal,
    })

    let buffer: Buffer | null = null

    if (image.uint8Array && image.uint8Array.byteLength > 0) {
      buffer = Buffer.from(image.uint8Array)
    } else if (image.base64) {
      buffer = Buffer.from(image.base64, IMAGE_BASE64_ENCODING)
    }

    if (!buffer || buffer.length === 0) {
      throw new Error("[ai-generate-image] Empty image payload from provider")
    }

    const contentType = image.mediaType || IMAGE_DEFAULT_MIME_TYPE
    const extension = contentType.split("/")[1] || IMAGE_DEFAULT_EXTENSION
    const fileName = `${createId()}.${extension}`
    const storagePath = getAIGeneratedImagePath({
      storagePrefix: ctx.storagePrefix,
      fileName,
    })

    await ctx.uploader.putObject(storagePath, buffer, {
      ContentType: contentType,
    })

    const finalImageUrl = getPublicUrl(storagePath)

    if (finalImageUrl) {
      await sendMessageWithRender(conversation.id, finalImageUrl)

      if (step.outputFieldId) {
        await saveResultToCustomField({
          contactId: conversation.contactId,
          customFieldId: step.outputFieldId,
          fullText: finalImageUrl,
          messageCount: 1,
          workspaceId: conversation.workspaceId,
        })
      }
    }
  } catch (error) {
    const parsedError = normalizeError(error)
    logger.error(parsedError, "[ai-generate-image] Step failed")

    await sendMessageWithRender(conversation.id, "Error generating image")

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
