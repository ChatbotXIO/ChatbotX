import { aiTimeouts } from "@chatbotx.io/ai"
import { uploader } from "@chatbotx.io/filesystem"
import type { HeavyJobAnalyzeImage } from "@chatbotx.io/worker-config"
import { generateText } from "ai"
import { UnrecoverableError } from "bullmq"
import { normalizeError } from "universal-error-normalizer"
import { env } from "../../env"
import { createReplyModel } from "../../lib/ai/reply-model"
import { logger } from "../../lib/logger"

const IMAGE_READER_MAX_OUTPUT_TOKENS = 800

async function assertImageWithinLimit(data: HeavyJobAnalyzeImage["data"]) {
  if (data.sizeBytes > env.HEAVY_MAX_IMAGE_BYTES) {
    throw new UnrecoverableError("Image is too large for image reader")
  }

  try {
    const head = await uploader.headObject(data.originPath)
    if (
      head.ContentLength != null &&
      head.ContentLength > env.HEAVY_MAX_IMAGE_BYTES
    ) {
      throw new UnrecoverableError("Image is too large for image reader")
    }
  } catch (err) {
    if (err instanceof UnrecoverableError) {
      throw err
    }
    logger.warn(
      {
        err: normalizeError(err),
        originPath: data.originPath,
        workspaceId: data.workspaceId,
      },
      "[image-reader] headObject failed, falling back to byte check",
    )
  }
}

export async function analyzeImage(data: HeavyJobAnalyzeImage["data"]) {
  await assertImageWithinLimit(data)

  const image = await uploader.getObject(data.originPath)
  if (image.byteLength > env.HEAVY_MAX_IMAGE_BYTES) {
    throw new UnrecoverableError("Image is too large for image reader")
  }

  const modelConfig = await createReplyModel({
    providerInfo: data.providerInfo,
    workspaceId: data.workspaceId,
  })
  if (!modelConfig) {
    throw new UnrecoverableError("Image reader model is not available")
  }

  const result = await generateText({
    model: modelConfig.model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: data.prompt,
          },
          {
            type: "image",
            image,
            mediaType: data.mimeType,
          },
        ],
      },
    ],
    maxOutputTokens: IMAGE_READER_MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    timeout: {
      totalMs: aiTimeouts.aiStep,
      stepMs: aiTimeouts.aiStep,
    },
  })

  return { analysis: result.text.trim() }
}
