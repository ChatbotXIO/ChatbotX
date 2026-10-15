import { crc32 } from "node:zlib"
import sharp from "sharp"
import { describe, expect, it } from "vitest"
import {
  AVATAR_MAX_DIMENSION,
  MEDIA_MAX_DIMENSION,
  MIN_SIZE_RATIO,
  optimizeImageForStorage,
} from "../src/image-optimize"

// A noisy photo-like image: flat fills compress too well to exercise the
// "only keep the re-encode when it is meaningfully smaller" rule.
const noisyImage = async (width: number, height: number, channels: 3 | 4) => {
  const raw = await sharp({
    create: {
      width,
      height,
      channels,
      noise: { type: "gaussian", mean: 128, sigma: 40 },
    },
  })
    .raw()
    .toBuffer()
  return sharp(raw, { raw: { width, height, channels } })
}

describe("optimizeImageForStorage", () => {
  it("re-encodes an avatar to WebP no larger than the avatar cap", async () => {
    const input = await (await noisyImage(480, 480, 3))
      .jpeg({ quality: 95 })
      .toBuffer()

    const result = await optimizeImageForStorage({
      bytes: input,
      mimeType: "image/jpeg",
      profile: "avatar",
    })

    expect(result.optimized).toBe(true)
    expect(result.mimeType).toBe("image/webp")
    expect(result.bytes.length).toBeLessThan(input.length)
    expect(result.width).toBe(AVATAR_MAX_DIMENSION)
    expect(result.height).toBe(AVATAR_MAX_DIMENSION)
  })

  it("keeps channel media as JPEG and caps its longest side", async () => {
    const input = await (await noisyImage(2400, 1200, 3))
      .jpeg({ quality: 98 })
      .toBuffer()

    const result = await optimizeImageForStorage({
      bytes: input,
      mimeType: "image/jpeg",
      profile: "media",
    })

    expect(result.optimized).toBe(true)
    expect(result.mimeType).toBe("image/jpeg")
    expect(result.bytes.length).toBeLessThan(input.length)
    // Inbox renders well under this; it stays legible for re-sends and
    // screenshots while cutting storage well below a 2048px cap.
    expect(MEDIA_MAX_DIMENSION).toBe(1600)
    expect(result.width).toBe(1600)
    expect(result.height).toBe(800)
  })

  it("never enlarges a small image", async () => {
    const input = await (await noisyImage(100, 80, 3))
      .jpeg({ quality: 100 })
      .toBuffer()

    const result = await optimizeImageForStorage({
      bytes: input,
      mimeType: "image/jpeg",
      profile: "avatar",
    })

    expect(result.width).toBe(100)
    expect(result.height).toBe(80)
  })

  it("applies EXIF orientation before re-encoding", async () => {
    const input = await (await noisyImage(400, 200, 3))
      .jpeg({ quality: 98 })
      .withMetadata({ orientation: 6 })
      .toBuffer()

    const result = await optimizeImageForStorage({
      bytes: input,
      mimeType: "image/jpeg",
      profile: "media",
    })

    expect(result.optimized).toBe(true)
    expect(result.width).toBe(200)
    expect(result.height).toBe(400)
  })

  it("leaves transparent media untouched so it is not flattened onto a background", async () => {
    const input = await (await noisyImage(600, 600, 4)).png().toBuffer()

    const result = await optimizeImageForStorage({
      bytes: input,
      mimeType: "image/png",
      profile: "media",
    })

    expect(result.optimized).toBe(false)
    expect(result.bytes).toBe(input)
    expect(result.mimeType).toBe("image/png")
  })

  it("re-encodes an alpha-channel screenshot that is fully opaque", async () => {
    const opaque = await (await noisyImage(900, 600, 3))
      .ensureAlpha(1)
      .raw()
      .toBuffer()
    const input = await sharp(opaque, {
      raw: { width: 900, height: 600, channels: 4 },
    })
      .png()
      .toBuffer()

    const result = await optimizeImageForStorage({
      bytes: input,
      mimeType: "image/png",
      profile: "media",
    })

    expect(result.optimized).toBe(true)
    expect(result.mimeType).toBe("image/jpeg")
  })

  it("does not decode an image whose declared size exceeds the pixel cap", async () => {
    // A valid 1x1 PNG whose header is rewritten to claim 20000x20000 pixels: a
    // tiny payload that would otherwise expand to gigabytes when decoded.
    const png = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "#000" },
    })
      .png()
      .toBuffer()
    const ihdr = png.subarray(12, 29)
    ihdr.writeUInt32BE(20_000, 4)
    ihdr.writeUInt32BE(20_000, 8)
    png.writeUInt32BE(crc32(ihdr), 29)

    const result = await optimizeImageForStorage({
      bytes: png,
      mimeType: "image/png",
      profile: "media",
    })

    expect(result.optimized).toBe(false)
    expect(result.bytes).toBe(png)
  })

  it("leaves animated images untouched", async () => {
    const frame = await (await noisyImage(64, 64, 4)).raw().toBuffer()
    const input = await sharp(Buffer.concat([frame, frame]), {
      raw: { width: 64, height: 128, channels: 4, pageHeight: 64 },
    })
      .gif()
      .toBuffer()

    const result = await optimizeImageForStorage({
      bytes: input,
      mimeType: "image/gif",
      profile: "media",
    })

    expect(result.optimized).toBe(false)
    expect(result.bytes).toBe(input)
  })

  it("stores an image sent as a document in its original form", async () => {
    const input = await (await noisyImage(600, 300, 3))
      .jpeg({ quality: 98 })
      .toBuffer()

    const result = await optimizeImageForStorage({
      bytes: input,
      mimeType: "image/jpeg",
      profile: "original",
    })

    expect(result).toMatchObject({
      optimized: false,
      bytes: input,
      mimeType: "image/jpeg",
    })
  })

  it("leaves non-image payloads untouched", async () => {
    const input = Buffer.from("not an image")

    const result = await optimizeImageForStorage({
      bytes: input,
      mimeType: "video/mp4",
      profile: "media",
    })

    expect(result).toMatchObject({
      optimized: false,
      bytes: input,
      mimeType: "video/mp4",
    })
  })

  it("returns the original bytes when the image cannot be decoded", async () => {
    const input = Buffer.from("corrupt jpeg bytes")

    const result = await optimizeImageForStorage({
      bytes: input,
      mimeType: "image/jpeg",
      profile: "media",
    })

    expect(result.optimized).toBe(false)
    expect(result.bytes).toBe(input)
    expect(result.mimeType).toBe("image/jpeg")
  })

  it("keeps the original when re-encoding does not save enough", async () => {
    const input = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#ffffff" },
    })
      .jpeg({ quality: 50, mozjpeg: true })
      .toBuffer()

    const result = await optimizeImageForStorage({
      bytes: input,
      mimeType: "image/jpeg",
      profile: "media",
    })

    expect(result.optimized).toBe(false)
    expect(result.bytes).toBe(input)
  })

  it("requires a 20% saving for media and 10% for avatars", async () => {
    // Policy knobs, pinned: the ratio decides whether a finished encode is
    // worth writing back. Avatars are always worth it (rendered on every
    // inbox row); media must earn the extra write.
    expect(MIN_SIZE_RATIO).toEqual({ avatar: 0.9, media: 0.8 })

    // A q80 photo re-encoded at q80 lands within a few percent of its source:
    // under the 20% rule it is kept as-is.
    const input = await (await noisyImage(600, 400, 3))
      .jpeg({ quality: 80 })
      .toBuffer()
    const result = await optimizeImageForStorage({
      bytes: input,
      mimeType: "image/jpeg",
      profile: "media",
    })
    expect(result.optimized).toBe(false)
    expect(result.bytes).toBe(input)
  })

  it("accepts an ArrayBuffer input", async () => {
    const buffer = await (await noisyImage(480, 480, 3))
      .jpeg({ quality: 95 })
      .toBuffer()
    const input = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    )

    const result = await optimizeImageForStorage({
      bytes: input,
      mimeType: "image/jpeg",
      profile: "avatar",
    })

    expect(result.optimized).toBe(true)
    expect(Buffer.isBuffer(result.bytes)).toBe(true)
  })
})
