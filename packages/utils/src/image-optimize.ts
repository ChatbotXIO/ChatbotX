import { getChildLogger } from "@chatbotx.io/logger"
import sharp, { type Sharp } from "sharp"
import {
  getImageOptimizationSettings,
  type ProfileSettings,
} from "./image-optimize-settings"

const logger = getChildLogger("image-optimize")

/**
 * Server-only: `sharp` is a native addon. Import this subpath only from code
 * that runs in Node (integrations, worker, builder route handlers).
 *
 * Re-encodes images before they are written to object storage. Storage is
 * dominated by channel media and contact avatars that were stored at their
 * source size, while the inbox renders avatars at ~32–48px.
 *
 * - `avatar`: our UI is the only consumer, so WebP is safe. Capped at 256px
 *   by default, which stays sharp for a 48px avatar on a 3x display.
 * - `media`: may later be re-sent to a channel (WhatsApp accepts JPEG/PNG, not
 *   WebP images), so it stays JPEG. Capped by default at 1600px on the longest
 *   side — well above what the inbox renders and still legible for a re-send —
 *   with 4:4:4 chroma so text in screenshots does not smear.
 *
 * - `original`: stored as-is. For an image the sender attached as a document
 *   or file (a scan, an invoice): they chose to send the original.
 *
 * Sizes, quality and the minimum saving are configurable through
 * `STORED_IMAGE_*` environment variables (`getImageOptimizationSettings`).
 *
 * Failure-safe: anything unsupported, animated, transparent media, undecodable
 * or not meaningfully smaller is returned untouched — optimization must never
 * fail or degrade an upload.
 */
export type ImageOptimizeProfile = "avatar" | "media" | "original"
type OptimizingProfile = Exclude<ImageOptimizeProfile, "original">

export type OptimizedImage = {
  bytes: Buffer
  mimeType: string
  /** True when `bytes` is the re-encoded image rather than the original. */
  optimized: boolean
  /** Output dimensions; only set when `optimized` is true. */
  width?: number
  height?: number
  /** File extension of the encoded format; only set when `optimized`. */
  extension?: string
}

// Encoding shares its process with other jobs: keep libvips to a few threads
// per image and do not cache operations across one-shot encodes. Applied on
// first use, not on import, so merely importing this module never retunes the
// process-wide sharp instance (e.g. Next.js image optimization).
let sharpConfigured = false
const configureSharp = () => {
  if (sharpConfigured) {
    return
  }
  sharp.concurrency(2)
  sharp.cache(false)
  sharpConfigured = true
}

const OPTIMIZABLE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
])

const toBuffer = (bytes: Buffer | ArrayBuffer | Uint8Array): Buffer => {
  if (Buffer.isBuffer(bytes)) {
    return bytes
  }
  if (bytes instanceof ArrayBuffer) {
    return Buffer.from(bytes)
  }
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

const normalizeMimeType = (mimeType: string) =>
  mimeType.split(";")[0]?.trim().toLowerCase() ?? ""

const resizeInside = (image: Sharp, maxDimension: number): Sharp =>
  image.resize(maxDimension, maxDimension, {
    fit: "inside",
    withoutEnlargement: true,
  })

const ENCODERS: Record<
  OptimizingProfile,
  {
    mimeType: string
    extension: string
    encode: (image: Sharp, settings: ProfileSettings) => Sharp
  }
> = {
  avatar: {
    mimeType: "image/webp",
    extension: "webp",
    encode: (image, settings) =>
      resizeInside(image, settings.maxDimension).webp({
        quality: settings.quality,
        effort: 4,
      }),
  },
  media: {
    mimeType: "image/jpeg",
    extension: "jpg",
    encode: (image, settings) =>
      resizeInside(image, settings.maxDimension).jpeg({
        quality: settings.quality,
        mozjpeg: true,
        chromaSubsampling: "4:4:4",
      }),
  },
}

/**
 * Width and height from the image header, or null when the bytes are not an
 * image libvips can read. Header only: nothing is decoded, so the decode
 * guard does not apply.
 */
export const readImageDimensions = async (
  bytes: Buffer,
): Promise<{ width?: number; height?: number } | null> => {
  try {
    const { width, height } = await sharp(bytes, {
      limitInputPixels: false,
    }).metadata()
    return { width, height }
  } catch {
    return null
  }
}

export async function optimizeImageForStorage(input: {
  bytes: Buffer | ArrayBuffer | Uint8Array
  mimeType: string
  profile: ImageOptimizeProfile
}): Promise<OptimizedImage> {
  const original = toBuffer(input.bytes)
  const unchanged: OptimizedImage = {
    bytes: original,
    mimeType: input.mimeType,
    optimized: false,
  }

  const { profile } = input
  if (
    profile === "original" ||
    !OPTIMIZABLE_MIME_TYPES.has(normalizeMimeType(input.mimeType))
  ) {
    return unchanged
  }

  configureSharp()
  try {
    // Inside the try: a misconfigured setting keeps the source, like any
    // other reason the encode cannot run.
    const settings = getImageOptimizationSettings()
    const profileSettings = settings[profile]
    const options = { limitInputPixels: settings.maxInputPixels }
    const metadata = await sharp(original, options).metadata()
    if ((metadata.pages ?? 1) > 1) {
      return unchanged
    }
    // JPEG has no alpha: only real transparency keeps media in its source
    // format. Phone screenshots often carry a fully opaque alpha channel.
    if (
      profile === "media" &&
      metadata.hasAlpha &&
      !(await sharp(original, options).stats()).isOpaque
    ) {
      return unchanged
    }

    // `rotate()` with no argument bakes the EXIF orientation into the pixels;
    // the encoders drop metadata by default, so it must not be lost.
    const { mimeType, extension, encode } = ENCODERS[profile]
    const { data, info } = await encode(
      sharp(original, options).rotate(),
      profileSettings,
    )
      .timeout({ seconds: settings.encodeTimeoutSeconds })
      .toBuffer({ resolveWithObject: true })

    const maxBytes =
      original.length * (1 - profileSettings.minSavingPercent / 100)
    if (data.length > maxBytes) {
      return unchanged
    }

    return {
      bytes: data,
      mimeType,
      optimized: true,
      width: info.width,
      height: info.height,
      extension,
    }
  } catch (err) {
    // Undecodable, unsupported, too slow or misconfigured: store the source
    // as-is, but say so — a systematic failure would silently stop compression.
    logger.warn({ err, profile }, "Image re-encode failed; keeping the source")
    return unchanged
  }
}
