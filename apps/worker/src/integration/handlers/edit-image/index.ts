import { aiProviders, aiTimeouts } from "@chatbotx.io/ai"
import {
  aiIntegrationService,
  createAIImageModelInstance,
} from "@chatbotx.io/ai/server"
import { getPublicUrl } from "@chatbotx.io/database/utils"
import {
  AI_EDIT_IMAGE_FALLBACK_OPENAI_MODEL,
  type AIEditImageSchema,
  getAIGeneratedImagePath,
  IMAGE_BASE64_ENCODING,
  IMAGE_DEFAULT_EXTENSION,
  IMAGE_DEFAULT_MIME_TYPE,
} from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { generateImage, type ImageModel } from "ai"
import ky from "ky"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import {
  getIntegrationContext,
  readCustomFieldValue,
  saveResultToCustomField,
} from "../../utils/contact"
import { sendMessageWithRender } from "../../utils/message"
import type { ExecuteStepProps } from "../flow"
import { editImageInputSchema } from "./schema"

async function fetchImageAsBuffer(url: string): Promise<Buffer> {
  const arrayBuffer = await ky.get(url).arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function handleAIEditImage({
  conversation,
  contactInbox: baseContactInbox,
  step,
}: ExecuteStepProps<AIEditImageSchema>) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)

  try {
    const ctx = await getIntegrationContext({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      contactInbox: baseContactInbox,
    })

    if (!ctx) {
      return
    }

    const imageUrl = await readCustomFieldValue({
      contactId: conversation.contactId,
      customFieldId: step.inputFieldId,
    })

    const inputValidation = editImageInputSchema.safeParse({
      imageUrl: imageUrl ?? "",
      prompt: step.prompt,
      provider: step.provider,
      model: step.model,
      size: step.size,
      quality: step.quality,
    })

    if (!inputValidation.success) {
      logger.warn(
        {
          errors: inputValidation.error.issues,
          conversationId: conversation.id,
        },
        "[ai-edit-image] Invalid input, skipping",
      )
      return
    }

    const aiConfig = await aiIntegrationService.findBy({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    if (!aiConfig) {
      return
    }

    let model: ImageModel

    try {
      model = createAIImageModelInstance({
        model: aiConfig,
        provider: step.provider,
        modelId: step.model,
        abortSignal: controller.signal,
      })
    } catch {
      if (step.provider === aiProviders.enum.openai) {
        model = createAIImageModelInstance({
          model: aiConfig,
          provider: step.provider,
          modelId: AI_EDIT_IMAGE_FALLBACK_OPENAI_MODEL,
          abortSignal: controller.signal,
        })
      } else {
        throw new Error(
          `[ai-edit-image] Cannot create image model for provider: ${step.provider}`,
        )
      }
    }

    const inputImageBuffer = await fetchImageAsBuffer(
      inputValidation.data.imageUrl,
    )

    const size =
      step.provider === aiProviders.enum.openai
        ? (step.size as `${number}x${number}`)
        : undefined

    const aspectRatio =
      step.provider === aiProviders.enum.gemini
        ? (step.size as `${number}:${number}`)
        : undefined

    const { images } = await generateImage({
      model,
      prompt: {
        images: [inputImageBuffer],
        text: step.prompt,
      },
      size,
      aspectRatio,
      abortSignal: controller.signal,
    })

    const image = images[0]
    if (!image) {
      throw new Error("[ai-edit-image] No image returned from provider")
    }

    let buffer: Buffer | null = null

    if (image.uint8Array && image.uint8Array.byteLength > 0) {
      buffer = Buffer.from(image.uint8Array)
    } else if (image.base64) {
      buffer = Buffer.from(image.base64, IMAGE_BASE64_ENCODING)
    }

    if (!buffer || buffer.length === 0) {
      throw new Error("[ai-edit-image] Empty image payload from provider")
    }

    const contentType = image.mediaType || IMAGE_DEFAULT_MIME_TYPE
    const extension = contentType.split("/")[1] || IMAGE_DEFAULT_EXTENSION
    const fileName = `${createId()}.${extension}`
    const storagePath = getAIGeneratedImagePath({
      storagePrefix: ctx.storagePrefix,
      fileName,
      conversationId: conversation.id,
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
          workspaceId: conversation.workspaceId,
        })
      }
    }
  } catch (error) {
    const parsedError = normalizeError(error)
    logger.error(
      {
        ...parsedError,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        action: "aiEditImage",
      },
      "[ai-edit-image] Step failed",
    )

    await sendMessageWithRender(conversation.id, "Error editing image")

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
