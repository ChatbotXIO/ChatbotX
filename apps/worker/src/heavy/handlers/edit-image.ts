import { aiProviders, aiTimeouts } from "@chatbotx.io/ai"
import {
  aiIntegrationService,
  createAIImageModelInstance,
} from "@chatbotx.io/ai/server"
import { resolveTenantSettings } from "@chatbotx.io/business"
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
import sharp from "sharp"
import { normalizeError } from "universal-error-normalizer"
import { env } from "../../env"
import { editImageInputSchema } from "../../integration/handlers/edit-image/schema"
import type { HeavyStepComputeProps } from "../../integration/handlers/flow-utils"
import {
  getIntegrationContext,
  readCustomFieldValue,
} from "../../integration/utils/contact"
import { logger } from "../../lib/logger"
import { downloadWithByteLimit } from "./bounded-download"
import { toChannelSafeImage } from "./channel-safe-image"
import { ExpectedHeavyStepError } from "./errors"
import { getOpenAIEditImageQuality } from "./image-options"

const FETCH_IMAGE_TIMEOUT_MS = 30_000
const ALLOWED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"])
// `sharp` format names of the inputs the image edit APIs accept.
const EDITABLE_IMAGE_FORMATS = new Set(["png", "jpeg", "webp", "gif"])

async function fetchImageAsBuffer(
  url: string,
  signal: AbortSignal,
): Promise<Buffer> {
  const { buffer } = await downloadWithByteLimit({
    label: "image",
    maxBytes: env.HEAVY_MAX_IMAGE_BYTES,
    signal,
    timeout: FETCH_IMAGE_TIMEOUT_MS,
    url,
  })
  // Check the bytes, not `content-type`: CDNs often serve images as
  // `application/octet-stream`, and a non-image otherwise fails inside the
  // AI SDK as a retryable error.
  const format = await sharp(buffer)
    .metadata()
    .then((metadata) => metadata.format)
    .catch(() => undefined)
  if (!(format && EDITABLE_IMAGE_FORMATS.has(format))) {
    throw new ExpectedHeavyStepError("Input is not a supported image")
  }
  return buffer
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
      throw new ExpectedHeavyStepError("Integration context not found")
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
      throw new ExpectedHeavyStepError("Invalid input for image edit")
    }

    const aiConfig = await aiIntegrationService.findBy({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    if (!aiConfig) {
      throw new ExpectedHeavyStepError("AI integration not found")
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
          err: normalizeError(modelError),
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
        throw new ExpectedHeavyStepError(
          `[ai-edit-image] Cannot create image model for provider: ${step.provider}`,
        )
      }
    }

    const inputImageBuffer = await fetchImageAsBuffer(
      inputValidation.data.imageUrl,
      controller.signal,
    )

    if (inputImageBuffer.length > env.HEAVY_MAX_IMAGE_BYTES) {
      throw new ExpectedHeavyStepError(
        `[ai-edit-image] Input image too large: ${inputImageBuffer.length} bytes`,
      )
    }

    // Muse keeps the input aspect ratio when no size is sent and rejects
    // `quality`/`aspect_ratio`, so it shares the OpenAI size path only.
    const size =
      (step.provider === aiProviders.enum.openai ||
        step.provider === aiProviders.enum.muse) &&
      step.size !== "auto"
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
              quality: getOpenAIEditImageQuality(step.quality),
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

    let rawBuffer: Buffer | null = null

    if (image.uint8Array && image.uint8Array.byteLength > 0) {
      rawBuffer = Buffer.from(image.uint8Array)
    } else if (image.base64) {
      rawBuffer = Buffer.from(image.base64, IMAGE_BASE64_ENCODING)
    }

    if (!rawBuffer || rawBuffer.length === 0) {
      throw new Error("[ai-edit-image] Empty image payload from provider")
    }

    const { buffer, contentType } = await toChannelSafeImage({
      buffer: rawBuffer,
      contentType: image.mediaType || IMAGE_DEFAULT_MIME_TYPE,
    })

    if (buffer.length > env.HEAVY_MAX_IMAGE_BYTES) {
      throw new ExpectedHeavyStepError(
        `[ai-edit-image] Image too large: ${buffer.length} bytes`,
      )
    }

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
