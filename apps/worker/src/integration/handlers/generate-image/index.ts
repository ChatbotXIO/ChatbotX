import { aiProviders, aiTimeouts } from "@chatbotx.io/ai"
import {
  aiIntegrationService,
  createAIImageModelInstance,
} from "@chatbotx.io/ai/server"
import { resolvePlatformSettings } from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import {
  type AIGenerateImageSchema,
  getAIGeneratedImagePath,
  IMAGE_AUTO_VALUE,
  IMAGE_BASE64_ENCODING,
  IMAGE_DEFAULT_EXTENSION,
  IMAGE_DEFAULT_MIME_TYPE,
} from "@chatbotx.io/flow-config"
import { generateImage } from "ai"
import { logger } from "../../../lib/logger"
import {
  getIntegrationContext,
  saveResultToCustomField,
} from "../../utils/contact"
import { sendMessageWithRender } from "../../utils/message"
import type { ExecuteStepProps } from "../flow"

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"])

export async function handleAIGenerateImage({
  conversation,
  contactInbox: baseContactInbox,
  metadata,
  step,
}: ExecuteStepProps<AIGenerateImageSchema>) {
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

    const ctx = await getIntegrationContext({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      contactInbox: baseContactInbox,
    })

    if (!ctx) {
      logger.warn(
        {
          workspaceId: conversation.workspaceId,
          conversationId: conversation.id,
        },
        "[ai-generate-image] Integration context not found, skipping",
      )
      return
    }

    const model = createAIImageModelInstance({
      model: aiConfig,
      provider: step.provider,
      modelId: step.model,
      abortSignal: controller.signal,
    })

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

    // Forward quality to OpenAI provider options — "hd" costs 2× but produces
    // sharper results; all other values ("md", "ld", "auto") map to "standard".
    const providerOptions =
      step.provider === aiProviders.enum.openai && step.quality !== "auto"
        ? {
            openai: {
              quality: step.quality === "hd" ? "hd" : "standard",
            },
          }
        : undefined

    const { image } = await generateImage({
      model,
      prompt: step.prompt,
      size,
      aspectRatio,
      providerOptions,
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

    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(
        `[ai-generate-image] Image too large: ${buffer.length} bytes`,
      )
    }

    const contentType = image.mediaType || IMAGE_DEFAULT_MIME_TYPE
    const rawExt = contentType.split("/")[1]?.split(";")[0]?.trim() ?? ""
    const extension = ALLOWED_EXTENSIONS.has(rawExt)
      ? rawExt
      : IMAGE_DEFAULT_EXTENSION

    // Use a deterministic execution ID so BullMQ retries overwrite the same
    // S3 object instead of orphaning the previously uploaded file.
    const executionId = metadata?.stepId ?? step.id
    const fileName = `${executionId}.${extension}`
    const storagePath = getAIGeneratedImagePath({
      storagePrefix: ctx.storagePrefix,
      fileName,
      conversationId: conversation.id,
    })

    await ctx.uploader.putObject(storagePath, buffer, {
      ContentType: contentType,
    })

    const { storageUrl } = await resolvePlatformSettings({
      workspaceId: conversation.workspaceId,
    })
    const finalImageUrl = getPublicFileUrl(storagePath, storageUrl)

    await sendMessageWithRender(conversation.id, finalImageUrl, undefined, {
      forceUrl: true,
      storagePath,
    })

    if (step.outputFieldId) {
      await saveResultToCustomField({
        contactId: conversation.contactId,
        customFieldId: step.outputFieldId,
        fullText: finalImageUrl,
        workspaceId: conversation.workspaceId,
      })
    }
  } catch (error) {
    logger.error(
      {
        err: error,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
      },
      "[ai-generate-image] Step failed",
    )

    await sendMessageWithRender(conversation.id, "Error generating image")

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
