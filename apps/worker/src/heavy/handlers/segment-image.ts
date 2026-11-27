import { aiProviders, aiTimeouts } from "@chatbotx.io/ai"
import { type SegmentationBox, segmentImage } from "@chatbotx.io/ai/sam"
import { aiIntegrationService } from "@chatbotx.io/ai/server"
import { resolveTenantSettings } from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import {
  type AISegmentImageSchema,
  getAIGeneratedImagePath,
} from "@chatbotx.io/flow-config"
import { secretTextAuthSchema } from "@chatbotx.io/sdk"
import type {
  HeavyStepOutputValue,
  HeavyStepResultData,
} from "@chatbotx.io/worker-config"
import sharp from "sharp"
import { z } from "zod"
import { env } from "../../env"
import type { HeavyStepComputeProps } from "../../integration/handlers/flow-utils"
import {
  getIntegrationContext,
  readCustomFieldValue,
} from "../../integration/utils/contact"
import { logger } from "../../lib/logger"
import { downloadWithByteLimit } from "./bounded-download"
import {
  type ChannelSafeImage,
  encodeChannelSafeImage,
  hasTransparency,
} from "./channel-safe-image"
import { ExpectedHeavyStepError } from "./errors"

const FETCH_IMAGE_TIMEOUT_MS = 30_000
// The heavy worker shares its process with chat/integration work, so the
// decoded bitmap is bounded, not just the downloaded bytes (pixel bombs).
export const SEGMENT_MAX_INPUT_PIXELS = 25_000_000
// `sharp` format names SAM is sent.
const SEGMENTABLE_IMAGE_FORMATS = new Set(["png", "jpeg", "webp", "gif"])

const sourceUrlSchema = z.url({ protocol: /^https?$/ })

type NormalizedImage = {
  /** The bytes SAM sees. */
  buffer: Buffer
  height: number
  mimeType: string
  /** The downloaded bytes; crops are cut from them after the same rotation. */
  source: Buffer
  transparent: boolean
  width: number
}

type CropBox = {
  bottom: number
  left: number
  right: number
  top: number
}

type DetailsBox = CropBox & { confidence?: number }

export type SegmentImageComputeProps =
  HeavyStepComputeProps<AISegmentImageSchema> & {
    /**
     * The heavy job id (`buildHeavyJobId`): the same for every retry of one
     * run, different for every later run, so it names the output object.
     */
    jobId: string
  }

async function downloadImage(
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
  return buffer
}

function decodeOriented(input: Buffer) {
  return sharp(input, { limitInputPixels: SEGMENT_MAX_INPUT_PIXELS }).rotate()
}

/**
 * Applies EXIF orientation and re-encodes once for SAM. The crop is cut from
 * the source after the same rotation, so boxes line up with the pixels they
 * cut without a second lossy pass. Only real transparency stays PNG: an
 * opaque alpha channel (screenshots, GIFs) would bloat the request.
 */
async function normalizeImage(input: Buffer): Promise<NormalizedImage> {
  // Check the bytes, not `content-type`: CDNs often serve images as
  // `application/octet-stream`. `metadata()` reads only the header, so the
  // pixel ceiling is checked below with its own message instead of failing
  // here as "not an image".
  const metadata = await sharp(input, { limitInputPixels: false })
    .metadata()
    .catch(() => undefined)
  if (!(metadata?.format && SEGMENTABLE_IMAGE_FORMATS.has(metadata.format))) {
    throw new ExpectedHeavyStepError("Input is not a supported image")
  }
  if (
    !(metadata.width && metadata.height) ||
    metadata.width * metadata.height > SEGMENT_MAX_INPUT_PIXELS
  ) {
    throw new ExpectedHeavyStepError(
      `Input image exceeds ${SEGMENT_MAX_INPUT_PIXELS} pixels`,
    )
  }

  const transparent = await hasTransparency(decodeOriented(input))
  const { buffer, contentType } = await encodeChannelSafeImage(
    decodeOriented(input),
    transparent,
  )
  if (buffer.length > env.HEAVY_MAX_IMAGE_BYTES) {
    throw new ExpectedHeavyStepError(
      `Normalized image too large: ${buffer.length} bytes`,
    )
  }
  // Header only: the size SAM must report for the bytes it is sent.
  const { width, height } = await sharp(buffer).metadata()
  return {
    buffer,
    height,
    mimeType: contentType,
    source: input,
    transparent,
    width,
  }
}

function boxArea(box: CropBox): number {
  return (box.right - box.left) * (box.bottom - box.top)
}

function toCropBox(box: SegmentationBox): CropBox {
  return {
    left: box.left,
    top: box.top,
    right: box.right,
    bottom: box.bottom,
  }
}

function toDetailsBox(box: SegmentationBox): DetailsBox {
  return {
    ...toCropBox(box),
    ...(box.confidence === undefined ? {} : { confidence: box.confidence }),
  }
}

/** `largest` keeps the first of the largest boxes; `all` covers every box. */
function selectCrop(
  boxes: readonly SegmentationBox[],
  matchSelection: AISegmentImageSchema["matchSelection"],
): { crop: CropBox; selected: SegmentationBox[] } {
  const [first, ...rest] = boxes
  if (!first) {
    throw new ExpectedHeavyStepError("Segmentation returned no boxes")
  }

  if (matchSelection === "all") {
    const crop = toCropBox(first)
    for (const box of rest) {
      crop.left = Math.min(crop.left, box.left)
      crop.top = Math.min(crop.top, box.top)
      crop.right = Math.max(crop.right, box.right)
      crop.bottom = Math.max(crop.bottom, box.bottom)
    }
    return { crop, selected: [...boxes] }
  }

  let best = first
  for (const box of rest) {
    if (boxArea(box) > boxArea(best)) {
      best = box
    }
  }
  return { crop: toCropBox(best), selected: [best] }
}

/** Channel-safe like edit-image: a crop a later step can send as is. */
async function renderCrop(
  image: NormalizedImage,
  crop: CropBox,
): Promise<ChannelSafeImage> {
  const output = await encodeChannelSafeImage(
    decodeOriented(image.source).extract({
      left: crop.left,
      top: crop.top,
      width: crop.right - crop.left,
      height: crop.bottom - crop.top,
    }),
    image.transparent,
  )
  if (output.buffer.length > env.HEAVY_MAX_IMAGE_BYTES) {
    throw new ExpectedHeavyStepError(
      `Cropped image too large: ${output.buffer.length} bytes`,
    )
  }
  return output
}

async function resolveMuseApiKey(workspaceId: string): Promise<string> {
  const aiConfig = await aiIntegrationService.findBy({
    workspaceId,
    provider: aiProviders.enum.muse,
  })
  if (!aiConfig) {
    throw new ExpectedHeavyStepError("Muse integration not found")
  }
  const auth = secretTextAuthSchema.safeParse(aiConfig.auth)
  if (!auth.success) {
    throw new ExpectedHeavyStepError("Muse integration has no API key")
  }
  return auth.data.secretText
}

export async function segmentImageOutput({
  contactInbox,
  conversation,
  jobId,
  step,
}: SegmentImageComputeProps): Promise<HeavyStepResultData> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), aiTimeouts.aiTotal)
  const logContext = {
    contactInboxId: contactInbox.id,
    conversationId: conversation.id,
    jobId,
    matchSelection: step.matchSelection,
    stepId: step.id,
    workspaceId: conversation.workspaceId,
  }

  try {
    const ctx = await getIntegrationContext({
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      contactInbox,
    })
    if (!ctx) {
      throw new ExpectedHeavyStepError("Integration context not found")
    }

    const sourceUrl = sourceUrlSchema.safeParse(
      (
        await readCustomFieldValue({
          contactId: conversation.contactId,
          customFieldId: step.inputFieldId,
        })
      )?.trim(),
    )
    if (!sourceUrl.success) {
      throw new ExpectedHeavyStepError("Source field has no image URL")
    }

    const apiKey = await resolveMuseApiKey(conversation.workspaceId)
    const image = await normalizeImage(
      await downloadImage(sourceUrl.data, controller.signal),
    )

    const segmentation = await segmentImage({
      apiKey,
      image: image.buffer,
      mimeType: image.mimeType,
      signal: controller.signal,
      sourceSize: { width: image.width, height: image.height },
      target: step.target,
    })
    if (segmentation.kind === "no_match") {
      logger.info(
        { ...logContext, matchedCount: 0 },
        "[ai-segment-image] No object matched",
      )
      return { status: "skip" }
    }

    // `segmentImage` already checked every box against `image`'s size.
    const { crop, selected } = selectCrop(
      segmentation.boxes,
      step.matchSelection,
    )
    const output = await renderCrop(image, crop)

    const extension = output.contentType === "image/png" ? "png" : "jpg"
    const storagePath = getAIGeneratedImagePath({
      storagePrefix: ctx.storagePrefix,
      fileName: `${jobId}.${extension}`,
      conversationId: conversation.id,
    })
    await ctx.uploader.putObject(storagePath, output.buffer, {
      ContentType: output.contentType,
    })
    const { storageUrl } = await resolveTenantSettings({
      workspaceId: conversation.workspaceId,
    })

    const outputValues: HeavyStepOutputValue[] = [
      {
        customFieldId: step.outputFieldId,
        value: getPublicFileUrl(storagePath, storageUrl),
      },
    ]
    if (step.detailsOutputFieldId) {
      outputValues.push({
        customFieldId: step.detailsOutputFieldId,
        value: JSON.stringify({
          count: segmentation.boxes.length,
          boxes: selected.map(toDetailsBox),
          crop,
          source: { width: image.width, height: image.height },
        }),
      })
    }

    logger.info(
      { ...logContext, matchedCount: segmentation.boxes.length },
      "[ai-segment-image] Cropped image",
    )
    return { status: "success", outputValues }
  } finally {
    clearTimeout(timeoutId)
  }
}
