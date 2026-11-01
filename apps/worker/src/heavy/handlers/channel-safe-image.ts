import sharp, { type Sharp } from "sharp"

export type ChannelSafeImage = {
  buffer: Buffer
  contentType: string
}

const WEBP_MIME_TYPE = "image/webp"
const JPEG_QUALITY = 90

/**
 * True only when some pixel is actually see-through: screenshots and GIFs
 * often carry an alpha channel that is fully opaque.
 */
export async function hasTransparency(image: Sharp): Promise<boolean> {
  const metadata = await image.clone().metadata()
  return Boolean(metadata.hasAlpha) && !(await image.clone().stats()).isOpaque
}

/**
 * Encodes an image a channel can re-send. Opaque images become JPEG (a PNG of
 * a 1600px photo is several MB); images with real transparency become PNG.
 */
export async function encodeChannelSafeImage(
  image: Sharp,
  transparent: boolean,
): Promise<ChannelSafeImage> {
  if (transparent) {
    return { buffer: await image.png().toBuffer(), contentType: "image/png" }
  }
  return {
    buffer: await image
      .jpeg({
        quality: JPEG_QUALITY,
        mozjpeg: true,
        chromaSubsampling: "4:4:4",
      })
      .toBuffer(),
    contentType: "image/jpeg",
  }
}

/**
 * Re-encodes a WebP image so it can be re-sent to a channel: WhatsApp accepts
 * JPEG/PNG images but treats WebP as a sticker. Muse (`muse-image-1.0`)
 * always returns WebP. Any other format is returned untouched.
 */
export async function toChannelSafeImage(
  image: ChannelSafeImage,
): Promise<ChannelSafeImage> {
  const mimeType = image.contentType.split(";")[0]?.trim().toLowerCase()
  if (mimeType !== WEBP_MIME_TYPE) {
    return image
  }

  return await encodeChannelSafeImage(
    sharp(image.buffer),
    await hasTransparency(sharp(image.buffer)),
  )
}
