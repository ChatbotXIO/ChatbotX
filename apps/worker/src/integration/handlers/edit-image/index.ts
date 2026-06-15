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
import ky from "ky"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"
import { assertPublicUrl } from "../../../lib/ssrf-guard"
import {
  getIntegrationContext,
  readCustomFieldValue,
  saveResultToCustomField,
} from "../../utils/contact"
import { sendMessageWithRender } from "../../utils/message"
import type { ExecuteStepProps } from "../flow"
import type { ExecuteStepResult } from "../step"
import { editImageInputSchema } from "./schema"

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

export async function handleAIEditImage({
  conversation,
  contactInbox: baseContactInbox,
  metadata,
  step,
}: ExecuteStepProps<AIEditImageSchema>): Promise<ExecuteStepResult> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)

  try {
    const ctx = await getIntegrationContext({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      contactInbox: baseContactInbox,
    })

    if (!ctx) {
      return {
        status: "error",
        errorMessage: "Integration context not found",
        result: null,
      }
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
      return {
        status: "error",
        errorMessage: "Invalid input for image edit",
        result: null,
      }
    }

    const aiConfig = await aiIntegrationService.findBy({
      workspaceId: conversation.workspaceId,
      provider: step.provider,
    })

    if (!aiConfig) {
      return {
        status: "error",
        errorMessage: "AI integration not found",
        result: null,
      }
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

    assertPublicUrl(inputValidation.data.imageUrl, "image URL")

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

    return { status: "success", result: null }
  } catch (err) {
    const error = normalizeError(err)
    logger.error(
      {
        err: error,
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        action: "aiEditImage",
      },
      "[ai-edit-image] Step failed",
    )
    return { status: "error", errorMessage: error.message, result: null }
  } finally {
    clearTimeout(timeoutId)
  }
}
