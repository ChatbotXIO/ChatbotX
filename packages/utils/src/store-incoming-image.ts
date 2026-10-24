import { getChildLogger } from "@chatbotx.io/logger"
import {
  type ImageOptimizeProfile,
  optimizeImageForStorage,
  readImageDimensions,
} from "./image-optimize"
import {
  getImageOptimizationSettings,
  type ImageOptimizationSettings,
  isStoredImageOptimizationEnabled,
  runInEncodeSlot,
} from "./image-optimize-settings"

/**
 * Server-only (`sharp`). Writes an image a channel just delivered, encoding it
 * on the way in when that is cheap and safe, so the bytes are written once and
 * never stored at source size. Everything it declines to encode is written
 * untouched, and the caller's background job (`optimizeStoredImage`) picks it
 * up afterwards.
 *
 * The gates keep the webhook path — which shares a process with every other
 * job — bounded: small inputs only, a fixed number of concurrent encodes, and
 * no queueing when they are all busy. Their limits are the
 * `STORED_IMAGE_INLINE_*` environment variables.
 */
const logger = getChildLogger("store-incoming-image")

export type IncomingImageUploader = {
  putObject(
    path: string,
    body: Buffer,
    options?: {
      ACL?: "public-read"
      ContentLength: number
      ContentType: string
    },
  ): Promise<unknown>
}

export type StoredIncomingImageSkip =
  | "disabled"
  | "profile"
  | "mime"
  | "bytes"
  | "pixels"
  | "busy"
  /** Encoding left the image as it was: unsupported format, animated, too little saved, or a failed encode. */
  | "unchanged"
  | "undecodable"

export type StoredIncomingImage = {
  originPath: string
  mimeType: string
  size: number
  width?: number
  height?: number
  /** True when the stored bytes are the re-encoded image. */
  optimized: boolean
  /** Why the original was stored instead; unset when `optimized`. */
  skipped?: StoredIncomingImageSkip
}

const toBuffer = (bytes: ArrayBuffer | Buffer): Buffer =>
  Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)

// A misconfigured setting must not lose the image: it is stored as received
// (the background job then reports the same configuration error loudly).
const readInlineLimits = (): ImageOptimizationSettings["inline"] | null => {
  try {
    return getImageOptimizationSettings().inline
  } catch (err) {
    logger.error(
      { err },
      "Invalid STORED_IMAGE_* setting; storing images without inline encoding",
    )
    return null
  }
}

const gateReason = (input: {
  profile: ImageOptimizeProfile
  size: number
  pixels: number | null
  limits: ImageOptimizationSettings["inline"]
}): StoredIncomingImageSkip | null => {
  if (
    !isStoredImageOptimizationEnabled() ||
    input.limits.maxConcurrentEncodes === 0
  ) {
    return "disabled"
  }
  if (input.profile === "original") {
    return "profile"
  }
  if (input.size > input.limits.maxBytes) {
    return "bytes"
  }
  if (input.pixels === null) {
    return "undecodable"
  }
  if (input.pixels > input.limits.maxPixels[input.profile]) {
    return "pixels"
  }
  return null
}

export type StoredMediaFields = {
  originPath: string
  mimeType: string
  size: number
  width?: number
  height?: number
  /** Set when the stored bytes were encoded here, so no background job is due. */
  optimized?: true
}

/** The attachment fields a stored image fills in, the same for every channel. */
export const toStoredMediaFields = (
  stored: StoredIncomingImage,
): StoredMediaFields => ({
  originPath: stored.originPath,
  mimeType: stored.mimeType,
  size: stored.size,
  ...(stored.width && stored.height
    ? { width: stored.width, height: stored.height }
    : {}),
  ...(stored.optimized ? { optimized: true } : {}),
})

type StoreIncomingImageInput = {
  uploader: IncomingImageUploader | undefined
  key: string
  bytes: ArrayBuffer | Buffer
  mimeType: string
  profile: ImageOptimizeProfile
  acl?: "public-read"
}

export async function storeIncomingImage(
  input: StoreIncomingImageInput,
): Promise<StoredIncomingImage> {
  const startedAt = Date.now()
  const result = await encodeAndStore(input)
  if (input.mimeType.toLowerCase().startsWith("image/")) {
    // Tuning data for the gates: how often inline encoding runs, why it does
    // not, and what it saves.
    logger.info(
      {
        profile: input.profile,
        optimized: result.optimized,
        skipped: result.skipped,
        bytesBefore: input.bytes.byteLength,
        bytesAfter: result.size,
        durationMs: Date.now() - startedAt,
      },
      "Stored incoming image",
    )
  }
  return result
}

async function encodeAndStore(
  input: StoreIncomingImageInput,
): Promise<StoredIncomingImage> {
  const original = toBuffer(input.bytes)
  const isImage = input.mimeType.toLowerCase().startsWith("image/")
  const dimensions = isImage ? await readImageDimensions(original) : null
  const pixels =
    dimensions?.width && dimensions.height
      ? dimensions.width * dimensions.height
      : null

  if (!isImage) {
    return write(input, original, input.mimeType, {
      optimized: false,
      skipped: "mime",
    })
  }

  const unchanged = (reason: StoredIncomingImageSkip) =>
    write(input, original, input.mimeType, {
      optimized: false,
      skipped: reason,
      ...dimensions,
    })
  const limits = readInlineLimits()
  if (!limits) {
    return unchanged("disabled")
  }
  const skipped = gateReason({
    profile: input.profile,
    size: original.length,
    pixels,
    limits,
  })
  if (skipped) {
    return unchanged(skipped)
  }

  // No queueing here: a busy process stores the original and the background
  // job encodes it later, so a webhook never waits on another encode.
  const slot = await runInEncodeSlot(
    { limit: limits.maxConcurrentEncodes, wait: false },
    () =>
      optimizeImageForStorage({
        bytes: original,
        mimeType: input.mimeType,
        profile: input.profile,
      }),
  )
  if (!slot) {
    return unchanged("busy")
  }
  const encoded = slot.value

  if (!encoded.optimized) {
    return unchanged("unchanged")
  }
  // The encoded object's key names its format: the background job skips keys
  // with an extension, so what was encoded here is never encoded twice (an
  // avatar's writers schedule that job on every write).
  return write(
    { ...input, key: `${input.key}.${encoded.extension}` },
    encoded.bytes,
    encoded.mimeType,
    { optimized: true, width: encoded.width, height: encoded.height },
  )
}

async function write(
  input: {
    uploader: IncomingImageUploader | undefined
    key: string
    acl?: "public-read"
  },
  bytes: Buffer,
  mimeType: string,
  extra: Pick<
    StoredIncomingImage,
    "optimized" | "skipped" | "width" | "height"
  >,
): Promise<StoredIncomingImage> {
  await input.uploader?.putObject(input.key, bytes, {
    ...(input.acl ? { ACL: input.acl } : {}),
    ContentLength: bytes.length,
    ContentType: mimeType,
  })
  return {
    originPath: input.key,
    mimeType,
    size: bytes.length,
    ...extra,
  }
}
