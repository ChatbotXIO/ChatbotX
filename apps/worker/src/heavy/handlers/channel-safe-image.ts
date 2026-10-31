import sharp from "sharp"

export type ChannelSafeImage = {
  buffer: Buffer
  contentType: string
}

const WEBP_MIME_TYPE = "image/webp"
const JPEG_QUALITY = 90

/**
 * Re-encodes a WebP image so it can be re-sent to a channel: WhatsApp accepts
 * JPEG/PNG images but treats WebP as a sticker. Muse (`muse-image-1.0`)
 * always returns WebP. Opaque images become JPEG (a PNG of a 1600px photo is
 * several MB); images with real transparency become PNG. Any other format is
 * returned untouched.
 */
export async function toChannelSafeImage(
  image: ChannelSafeImage,
): Promise<ChannelSafeImage> {
  const mimeType = image.contentType.split(";")[0]?.trim().toLowerCase()
  if (mimeType !== WEBP_MIME_TYPE) {
    return image
  }

  const metadata = await sharp(image.buffer).metadata()
  const transparent =
    metadata.hasAlpha && !(await sharp(image.buffer).stats()).isOpaque

  if (transparent) {
    return {
      buffer: await sharp(image.buffer).png().toBuffer(),
      contentType: "image/png",
    }
  }

  return {
    buffer: await sharp(image.buffer)
      .jpeg({
        quality: JPEG_QUALITY,
        mozjpeg: true,
        chromaSubsampling: "4:4:4",
      })
      .toBuffer(),
    contentType: "image/jpeg",
  }
}
