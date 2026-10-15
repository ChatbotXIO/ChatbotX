import sharp, { type Sharp } from "sharp"

/**
 * Server-only: `sharp` is a native addon. Import this subpath only from code
 * that runs in Node (integrations, worker, builder route handlers).
 *
 * Re-encodes images before they are written to object storage. Storage is
 * dominated by channel media and contact avatars that were stored at their
 * source size, while the inbox renders avatars at ~32–48px.
 *
 * - `avatar`: our UI is the only consumer, so WebP is safe. Capped at 256px,
 *   which stays sharp for a 48px avatar on a 3x display.
 * - `media`: may later be re-sent to a channel (WhatsApp accepts JPEG/PNG, not
 *   WebP images), so it stays JPEG. Capped at 1600px on the longest side —
 *   well above what the inbox renders and still legible for a re-send — with
 *   4:4:4 chroma so text in screenshots does not smear.
 *
 * - `original`: stored as-is. For an image the sender attached as a document
 *   or file (a scan, an invoice): they chose to send the original.
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
}

export const AVATAR_MAX_DIMENSION = 256
export const MEDIA_MAX_DIMENSION = 1600
const AVATAR_WEBP_QUALITY = 80
const MEDIA_JPEG_QUALITY = 80
// Keep the re-encode only when it is meaningfully smaller than the source: a
// 256px avatar is rendered on every inbox row, so 10% is enough; channel
// media must earn its extra write with 20%.
export const MIN_SIZE_RATIO = {
  avatar: 0.9,
  media: 0.8,
} as const satisfies Record<OptimizingProfile, number>
// A small, highly compressible PNG can declare enough pixels to exhaust
// memory on decode (an uncatchable OOM). Over the cap libvips throws and the
// source is kept as-is. 16MP covers a 12MP phone photo.
const MAX_INPUT_PIXELS: Record<OptimizingProfile, number> = {
  avatar: 4_000_000,
  media: 16_000_000,
}
// Bounds a pathological encode; the source is kept when it trips.
const ENCODE_TIMEOUT_SECONDS = 2

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

const encode = (
  image: Sharp,
  profile: OptimizingProfile,
): { pipeline: Sharp; mimeType: string } => {
  if (profile === "avatar") {
    return {
      pipeline: image
        .resize(AVATAR_MAX_DIMENSION, AVATAR_MAX_DIMENSION, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: AVATAR_WEBP_QUALITY, effort: 4 }),
      mimeType: "image/webp",
    }
  }

  return {
    pipeline: image
      .resize(MEDIA_MAX_DIMENSION, MEDIA_MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: MEDIA_JPEG_QUALITY,
        mozjpeg: true,
        chromaSubsampling: "4:4:4",
      }),
    mimeType: "image/jpeg",
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
    const options = { limitInputPixels: MAX_INPUT_PIXELS[profile] }
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
    const { pipeline, mimeType } = encode(
      sharp(original, options).rotate(),
      profile,
    )
    const { data, info } = await pipeline
      .timeout({ seconds: ENCODE_TIMEOUT_SECONDS })
      .toBuffer({ resolveWithObject: true })

    if (data.length > original.length * MIN_SIZE_RATIO[profile]) {
      return unchanged
    }

    return {
      bytes: data,
      mimeType,
      optimized: true,
      width: info.width,
      height: info.height,
    }
  } catch {
    // Undecodable or unsupported by libvips: store the source as-is.
    return unchanged
  }
}
