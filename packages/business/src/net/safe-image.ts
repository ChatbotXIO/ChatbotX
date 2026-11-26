import { imageSize } from "image-size"
import sharp from "sharp"
import { FeedImageImportError } from "../social-post-feed/image-importer"

/**
 * Node-only (sharp, a native addon). Deliberately NOT re-exported from the
 * package index: import it from its own subpath in worker / route-handler code
 * (AGENTS.md invariant 25).
 *
 * Turns bytes downloaded from an untrusted address into an image we are willing
 * to store and publish: the type is decided from the magic bytes (never from
 * `Content-Type` or the file name), the header is read first and an image that
 * is too large is refused before any decoding, and the pixels are decoded and
 * RE-ENCODED, so anything that is not pixels (a script in a polyglot file,
 * metadata, an appended payload) does not survive.
 */

export const FEED_IMAGE_MAX_BYTES = 8 * 1024 * 1024
export const FEED_IMAGE_MAX_SIDE_PIXELS = 6000
export const FEED_IMAGE_MAX_PIXELS = 36_000_000
export const FEED_IMAGE_OUTPUT_MAX_SIDE = 2048
const JPEG_QUALITY = 85
const WEBP_HEADER_END = 12

export type SniffedImageFormat = "jpeg" | "png" | "gif" | "webp"

export const sniffImageFormat = (
  bytes: Uint8Array,
): SniffedImageFormat | null => {
  const startsWith = (...values: number[]) =>
    values.every((value, index) => bytes[index] === value)
  if (startsWith(0xff, 0xd8, 0xff)) {
    return "jpeg"
  }
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return "png"
  }
  if (
    startsWith(0x47, 0x49, 0x46, 0x38) &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "gif"
  }
  if (
    bytes.length >= WEBP_HEADER_END &&
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp"
  }
  return null
}

const DECODE_TIMEOUT_SECONDS = 20

export type SafeImage = {
  bytes: Buffer
  extension: "jpg" | "png"
  height: number
  mimeType: "image/jpeg" | "image/png"
  width: number
}

/** Throws {@link FeedImageImportError} (`notAnImage`, `unsupported`, `tooLarge`, `tooManyPixels`, `decodeFailed`). */
export const reencodeUntrustedImage = async (
  bytes: Buffer,
): Promise<SafeImage> => {
  if (bytes.length > FEED_IMAGE_MAX_BYTES) {
    throw new FeedImageImportError(
      "tooLarge",
      "The picture is larger than 8 MB",
    )
  }
  const format = sniffImageFormat(bytes)
  if (!format) {
    throw new FeedImageImportError(
      "notAnImage",
      "The file is not a JPEG, PNG, WebP or GIF picture",
    )
  }
  let header: { height?: number; width?: number }
  try {
    header = imageSize(bytes)
  } catch {
    throw new FeedImageImportError(
      "decodeFailed",
      "The picture header cannot be read",
    )
  }
  const { width = 0, height = 0 } = header
  if (!(width > 0 && height > 0)) {
    throw new FeedImageImportError("decodeFailed", "The picture has no size")
  }
  if (
    width > FEED_IMAGE_MAX_SIDE_PIXELS ||
    height > FEED_IMAGE_MAX_SIDE_PIXELS ||
    width * height > FEED_IMAGE_MAX_PIXELS
  ) {
    throw new FeedImageImportError(
      "tooManyPixels",
      "The picture has too many pixels",
    )
  }
  try {
    // `animated` stays off: a GIF or animated WebP becomes its first frame.
    const input = sharp(bytes, {
      animated: false,
      failOn: "error",
      limitInputPixels: FEED_IMAGE_MAX_PIXELS,
      sequentialRead: true,
    })
    const meta = await input.metadata()
    const keepAlpha = meta.hasAlpha === true
    const pipeline = input
      .rotate()
      .timeout({ seconds: DECODE_TIMEOUT_SECONDS })
      .resize(FEED_IMAGE_OUTPUT_MAX_SIDE, FEED_IMAGE_OUTPUT_MAX_SIDE, {
        fit: "inside",
        withoutEnlargement: true,
      })
    // No `withMetadata`: EXIF, GPS and ICC profiles are dropped.
    const encoded = keepAlpha
      ? pipeline.png({ compressionLevel: 9 })
      : pipeline
          .flatten({ background: "#ffffff" })
          .jpeg({ mozjpeg: true, quality: JPEG_QUALITY })
    const { data, info } = await encoded.toBuffer({ resolveWithObject: true })
    return {
      bytes: data,
      extension: keepAlpha ? "png" : "jpg",
      height: info.height,
      mimeType: keepAlpha ? "image/png" : "image/jpeg",
      width: info.width,
    }
  } catch (error) {
    if (error instanceof FeedImageImportError) {
      throw error
    }
    throw new FeedImageImportError(
      "decodeFailed",
      "The picture cannot be decoded",
    )
  }
}
