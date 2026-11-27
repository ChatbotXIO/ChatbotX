import sharp from "sharp"
import { describe, expect, test } from "vitest"
import { toChannelSafeImage } from "../src/heavy/handlers/channel-safe-image"

const solid = (alpha: number) =>
  sharp({
    create: {
      width: 8,
      height: 8,
      channels: 4,
      background: { r: 200, g: 30, b: 30, alpha },
    },
  })

describe("toChannelSafeImage", () => {
  test("re-encodes an opaque WebP as JPEG", async () => {
    const webp = await solid(1).webp().toBuffer()

    const result = await toChannelSafeImage({
      buffer: webp,
      contentType: "image/webp",
    })

    expect(result.contentType).toBe("image/jpeg")
    expect((await sharp(result.buffer).metadata()).format).toBe("jpeg")
  })

  test("re-encodes a transparent WebP as PNG", async () => {
    const webp = await solid(0.5).webp({ lossless: true }).toBuffer()

    const result = await toChannelSafeImage({
      buffer: webp,
      contentType: "image/webp; charset=binary",
    })

    expect(result.contentType).toBe("image/png")
    expect((await sharp(result.buffer).metadata()).format).toBe("png")
  })

  test("returns non-WebP images untouched", async () => {
    const png = await solid(1).png().toBuffer()
    const input = { buffer: png, contentType: "image/png" }

    await expect(toChannelSafeImage(input)).resolves.toBe(input)
  })
})
