import { aiProviders, aiTimeouts } from "@chatbotx.io/ai"
import {
  aiIntegrationService,
  createAIImageModelInstance,
} from "@chatbotx.io/ai/server"
import { assertPublicUrl, resolveTenantSettings } from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import {
  AI_EDIT_IMAGE_FALLBACK_OPENAI_MODEL,
  type AIEditImageSchema,
  getAIGeneratedImagePath,
  IMAGE_BASE64_ENCODING,
  IMAGE_DEFAULT_EXTENSION,
  IMAGE_DEFAULT_MIME_TYPE,
} from "@chatbotx.io/flow-config"
import { generateImage, type ImageModel } from "ai"
import ky from "ky"
import { editImageInputSchema } from "../../integration/handlers/edit-image/schema"
import type { HeavyStepComputeProps } from "../../integration/handlers/flow-utils"
import {
  getIntegrationContext,
  readCustomFieldValue,
} from "../../integration/utils/contact"
import { logger } from "../../lib/logger"

const FETCH_IMAGE_TIMEOUT_MS = 30_000
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"])

async function fetchImageAsBuffer(
  url: string,
  signal: AbortSignal,
): Promise<Buffer> {
  const arrayBuffer = await ky
    .get(url, { signal, timeout: FETCH_IMAGE_TIMEOUT_MS })
    .arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function editImageOutput({
  conversation,
  contactInbox,
  metadata,
  step,
}: HeavyStepComputeProps<AIEditImageSchema>): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)

  try {
    const ctx = await getIntegrationContext({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      contactInbox,
    })

    if (!ctx) {
      throw new Error("Integration context not found")
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
      throw new Error("Invalid input for image edit")
    }

    const aiConfig = await aiIntegrationService.findBy({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    if (!aiConfig) {
      throw new Error("AI integration not found")
    }

    let model: ImageModel

    try {
      model = createAIImageModelInstance({
        model: aiConfig,
        provider: step.provider,
        modelId: step.model,
      })
    } catch (modelError) {
      logger.warn(
        {
          err: modelError,
          modelId: step.model,
          provider: step.provider,
          conversationId: conversation.id,
        },
        "[ai-edit-image] Failed to create model, attempting fallback",
      )
      if (step.provider === aiProviders.enum.openai) {
        model = createAIImageModelInstance({
          model: aiConfig,
          provider: step.provider,
          modelId: AI_EDIT_IMAGE_FALLBACK_OPENAI_MODEL,
        })
      } else {
        throw new Error(
          `[ai-edit-image] Cannot create image model for provider: ${step.provider}`,
        )
      }
    }

    await assertPublicUrl(inputValidation.data.imageUrl, "image URL")

    const inputImageBuffer = await fetchImageAsBuffer(
      inputValidation.data.imageUrl,
      controller.signal,
    )

    if (inputImageBuffer.length > MAX_IMAGE_BYTES) {
      throw new Error(
        `[ai-edit-image] Input image too large: ${inputImageBuffer.length} bytes`,
      )
    }

    const size =
      step.provider === aiProviders.enum.openai
        ? (step.size as `${number}x${number}`)
        : undefined

    const aspectRatio =
      step.provider === aiProviders.enum.gemini
        ? (step.size as `${number}:${number}`)
        : undefined

    const providerOptions =
      step.provider === aiProviders.enum.openai && step.quality !== "auto"
        ? {
            openai: {
              quality: step.quality === "hd" ? "hd" : "standard",
            },
          }
        : undefined

    const { images } = await generateImage({
      model,
      prompt: {
        images: [inputImageBuffer],
        text: step.prompt,
      },
      size,
      aspectRatio,
      providerOptions,
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

    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error(`[ai-edit-image] Image too large: ${buffer.length} bytes`)
    }

    const contentType = image.mediaType || IMAGE_DEFAULT_MIME_TYPE
    const rawExt = contentType.split("/")[1]?.split(";")[0]?.trim() ?? ""
    const extension = ALLOWED_IMAGE_EXTENSIONS.has(rawExt)
      ? rawExt
      : IMAGE_DEFAULT_EXTENSION

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

    const { storageUrl } = await resolveTenantSettings({
      workspaceId: conversation.workspaceId,
    })

    return getPublicFileUrl(storagePath, storageUrl)
  } finally {
    clearTimeout(timeoutId)
  }
}
