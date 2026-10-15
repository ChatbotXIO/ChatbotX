import { getChildLogger } from "@chatbotx.io/logger"
import sharp from "sharp"
import {
  type ImageOptimizeProfile,
  optimizeImageForStorage,
} from "./image-optimize"
import { keys } from "./keys"

/**
 * Server-only (`sharp`). Writes an image a channel just delivered, encoding it
 * on the way in when that is cheap and safe, so the bytes are written once and
 * never stored at source size. Everything it declines to encode is written
 * untouched, and the caller's background job (`optimizeStoredImage`) picks it
 * up afterwards.
 *
 * The gates keep the webhook path — which shares a process with every other
 * job — bounded: small inputs only, a fixed number of concurrent encodes, and
 * no queueing when they are all busy.
 */
const logger = getChildLogger("store-incoming-image")

export const INLINE_MAX_BYTES = 2 * 1024 * 1024
export const INLINE_MAX_PIXELS = {
  media: 8_000_000,
  avatar: 4_000_000,
} as const
export const INLINE_MAX_CONCURRENT_ENCODES = 2

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

let activeEncodes = 0

const readDimensions = async (
  bytes: Buffer,
): Promise<{ width?: number; height?: number } | null> => {
  try {
    // Header only; nothing is decoded, so the pixel limit is irrelevant here.
    const { width, height } = await sharp(bytes, {
      limitInputPixels: false,
    }).metadata()
    return { width, height }
  } catch {
    return null
  }
}

const toBuffer = (bytes: ArrayBuffer | Buffer): Buffer =>
  Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)

const gateReason = (input: {
  profile: ImageOptimizeProfile
  size: number
  pixels: number | null
}): StoredIncomingImageSkip | null => {
  if (keys().STORED_IMAGE_OPTIMIZATION === "off") {
    return "disabled"
  }
  if (input.profile === "original") {
    return "profile"
  }
  if (input.size > INLINE_MAX_BYTES) {
    return "bytes"
  }
  if (input.pixels === null) {
    return "undecodable"
  }
  if (input.pixels > INLINE_MAX_PIXELS[input.profile]) {
    return "pixels"
  }
  return null
}

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
  const dimensions = isImage ? await readDimensions(original) : null
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

  const skipped = gateReason({
    profile: input.profile,
    size: original.length,
    pixels,
  })
  const unchanged = (reason: StoredIncomingImageSkip) =>
    write(input, original, input.mimeType, {
      optimized: false,
      skipped: reason,
      ...dimensions,
    })
  if (skipped) {
    return unchanged(skipped)
  }

  if (activeEncodes >= INLINE_MAX_CONCURRENT_ENCODES) {
    return unchanged("busy")
  }
  activeEncodes += 1
  let encoded: Awaited<ReturnType<typeof optimizeImageForStorage>>
  try {
    encoded = await optimizeImageForStorage({
      bytes: original,
      mimeType: input.mimeType,
      profile: input.profile,
    })
  } finally {
    activeEncodes -= 1
  }

  if (!encoded.optimized) {
    return unchanged("unchanged")
  }
  return write(input, encoded.bytes, encoded.mimeType, {
    optimized: true,
    width: encoded.width,
    height: encoded.height,
  })
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
