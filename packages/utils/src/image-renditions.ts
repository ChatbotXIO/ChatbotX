import sharp from "sharp"

/**
 * Server-only: `sharp` is a native addon. Import this subpath only from code
 * that runs in Node (the business `outbound-media` subpath, workers).
 *
 * Helpers for channels that cap the size and format of the image URLs they
 * fetch (LINE: JPEG/PNG, original <= 10 MB, preview <= 1 MB). They are pure
 * byte-in / byte-out: downloading and storing belong to the caller.
 */

/** Refuses to decode anything bigger than this many pixels (decompression bombs). */
const MAX_INPUT_PIXELS = 100_000_000
const ENCODE_TIMEOUT_SECONDS = 20
const WHITE = { r: 255, g: 255, b: 255 }

export type ImageInspection = {
  format: string | null
  width: number | null
  height: number | null
  /** True for an animated/multi-frame image (GIF, APNG, animated WebP). */
  animated: boolean
}

/** Format and size from the header, or null when the bytes are not an image. */
export const inspectImage = async (
  bytes: Buffer,
): Promise<ImageInspection | null> => {
  try {
    const meta = await sharp(bytes, {
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata()
    return {
      format: meta.format ?? null,
      width: meta.width ?? null,
      height: meta.height ?? null,
      animated: (meta.pages ?? 1) > 1,
    }
  } catch {
    return null
  }
}

export type JpegWithinBytesInput = {
  bytes: Buffer
  /** Hard cap on the encoded size. */
  maxBytes: number
  /** Tried in order; each is a longest-side cap in pixels. */
  maxDimensions: readonly number[]
  /** Tried in order for each dimension. */
  qualities: readonly number[]
}

export type JpegRendition = { bytes: Buffer; width: number; height: number }

/**
 * Re-encodes `bytes` as a baseline-compatible JPEG no larger than `maxBytes`,
 * flattening transparency onto white and baking in EXIF rotation. Walks the
 * `maxDimensions` x `qualities` grid from best to worst and returns the first
 * that fits, or null when none does or the bytes cannot be decoded.
 */
export const renderJpegWithinBytes = async (
  input: JpegWithinBytesInput,
): Promise<JpegRendition | null> => {
  try {
    for (const maxDimension of input.maxDimensions) {
      for (const quality of input.qualities) {
        const { data, info } = await sharp(input.bytes, {
          limitInputPixels: MAX_INPUT_PIXELS,
        })
          .rotate()
          .resize(maxDimension, maxDimension, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .flatten({ background: WHITE })
          .jpeg({ quality, mozjpeg: true })
          .timeout({ seconds: ENCODE_TIMEOUT_SECONDS })
          .toBuffer({ resolveWithObject: true })
        if (data.length <= input.maxBytes) {
          return { bytes: data, width: info.width, height: info.height }
        }
      }
    }
    return null
  } catch {
    return null
  }
}

const PLACEHOLDER_SIZE = { width: 1024, height: 576 }

/**
 * A static dark 16:9 JPEG with a play glyph. Used as a video message's preview
 * when the platform has no real thumbnail (no ffmpeg here). Well under 100 KB.
 */
export const renderVideoPlaceholderJpeg = async (): Promise<Buffer> => {
  const { width, height } = PLACEHOLDER_SIZE
  const cx = width / 2
  const cy = height / 2
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#1f2937"/><circle cx="${cx}" cy="${cy}" r="72" fill="#ffffff" fill-opacity="0.9"/><polygon points="${cx - 22},${cy - 40} ${cx - 22},${cy + 40} ${cx + 44},${cy}" fill="#1f2937"/></svg>`
  return await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer()
}
