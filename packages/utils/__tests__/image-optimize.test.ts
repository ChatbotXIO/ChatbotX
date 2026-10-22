import { crc32 } from "node:zlib"
import sharp from "sharp"
import { afterEach, describe, expect, it, vi } from "vitest"
import { optimizeImageForStorage } from "../src/image-optimize"
import { getImageOptimizationSettings } from "../src/image-optimize-settings"

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
  afterEach(() => {
    vi.unstubAllEnvs()
  })

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
    expect(result.width).toBe(256)
    expect(result.height).toBe(256)
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
    // The saving decides whether a finished encode is worth writing back.
    // Avatars are always worth it (rendered on every inbox row); media must
    // earn the extra write.
    const { media, avatar } = getImageOptimizationSettings()
    expect(media.minSavingPercent).toBe(20)
    expect(avatar.minSavingPercent).toBe(10)

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

  it("uses the configured media size cap", async () => {
    vi.stubEnv("STORED_IMAGE_MEDIA_MAX_DIMENSION", "800")
    const input = await (await noisyImage(2400, 1200, 3))
      .jpeg({ quality: 98 })
      .toBuffer()

    const result = await optimizeImageForStorage({
      bytes: input,
      mimeType: "image/jpeg",
      profile: "media",
    })

    expect(result.width).toBe(800)
    expect(result.height).toBe(400)
  })

  it("uses the configured quality and avatar size", async () => {
    vi.stubEnv("STORED_IMAGE_MEDIA_QUALITY", "40")
    vi.stubEnv("STORED_IMAGE_AVATAR_MAX_DIMENSION", "128")
    // A q80 photo is not worth re-encoding at the default q80, but is at q40.
    const photo = await (await noisyImage(600, 400, 3))
      .jpeg({ quality: 80 })
      .toBuffer()
    const avatar = await (await noisyImage(480, 480, 3))
      .jpeg({ quality: 95 })
      .toBuffer()

    const media = await optimizeImageForStorage({
      bytes: photo,
      mimeType: "image/jpeg",
      profile: "media",
    })
    const resizedAvatar = await optimizeImageForStorage({
      bytes: avatar,
      mimeType: "image/jpeg",
      profile: "avatar",
    })

    expect(media.optimized).toBe(true)
    expect(resizedAvatar.width).toBe(128)
  })

  it("keeps the source when the configured saving is not reached", async () => {
    // Saved by default (q95 -> q80, same size), but not by 90%.
    const input = await (await noisyImage(1000, 800, 3))
      .jpeg({ quality: 95 })
      .toBuffer()
    const byDefault = await optimizeImageForStorage({
      bytes: input,
      mimeType: "image/jpeg",
      profile: "media",
    })
    expect(byDefault.optimized).toBe(true)
    vi.stubEnv("STORED_IMAGE_MEDIA_MIN_SAVING_PERCENT", "90")

    const result = await optimizeImageForStorage({
      bytes: input,
      mimeType: "image/jpeg",
      profile: "media",
    })

    expect(result.optimized).toBe(false)
    expect(result.bytes).toBe(input)
  })
})

describe("optimizeImageForStorage with a misconfigured environment", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns the source untouched instead of failing the upload", async () => {
    vi.stubEnv("STORED_IMAGE_MEDIA_QUALITY", "0")
    const input = await (await noisyImage(1000, 800, 3))
      .jpeg({ quality: 95 })
      .toBuffer()

    const result = await optimizeImageForStorage({
      bytes: input,
      mimeType: "image/jpeg",
      profile: "media",
    })

    expect(result).toMatchObject({ optimized: false, bytes: input })
  })
})

describe("getImageOptimizationSettings", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("defaults to the documented policy", () => {
    expect(getImageOptimizationSettings()).toEqual({
      media: { maxDimension: 1600, quality: 80, minSavingPercent: 20 },
      avatar: { maxDimension: 256, quality: 80, minSavingPercent: 10 },
      maxInputPixels: 16_000_000,
      encodeTimeoutSeconds: 2,
      inline: {
        maxBytes: 2 * 1024 * 1024,
        maxPixels: { media: 8_000_000, avatar: 4_000_000 },
        maxConcurrentEncodes: 2,
      },
      job: { minSourceBytes: 32 * 1024, maxSourceBytes: 10 * 1024 * 1024 },
    })
  })

  it("reads every value from the environment", () => {
    vi.stubEnv("STORED_IMAGE_INLINE_MAX_MB", "0.5")
    vi.stubEnv("STORED_IMAGE_INLINE_MAX_MEGAPIXELS", "12")
    vi.stubEnv("STORED_IMAGE_INLINE_AVATAR_MAX_MEGAPIXELS", "2")
    vi.stubEnv("STORED_IMAGE_INLINE_CONCURRENCY", "0")
    vi.stubEnv("STORED_IMAGE_JOB_MIN_SOURCE_KB", "64")
    vi.stubEnv("STORED_IMAGE_JOB_MAX_SOURCE_MB", "20")
    vi.stubEnv("STORED_IMAGE_MAX_INPUT_MEGAPIXELS", "24")
    vi.stubEnv("STORED_IMAGE_ENCODE_TIMEOUT_SECONDS", "5")

    expect(getImageOptimizationSettings()).toMatchObject({
      maxInputPixels: 24_000_000,
      encodeTimeoutSeconds: 5,
      inline: {
        maxBytes: 512 * 1024,
        maxPixels: { media: 12_000_000, avatar: 2_000_000 },
        maxConcurrentEncodes: 0,
      },
      job: { minSourceBytes: 64 * 1024, maxSourceBytes: 20 * 1024 * 1024 },
    })
  })

  it.each([
    ["STORED_IMAGE_MEDIA_QUALITY", "0"],
    ["STORED_IMAGE_MEDIA_QUALITY", "101"],
    ["STORED_IMAGE_AVATAR_MAX_DIMENSION", "abc"],
    ["STORED_IMAGE_MEDIA_MIN_SAVING_PERCENT", "100"],
    ["STORED_IMAGE_INLINE_CONCURRENCY", "-1"],
  ])("rejects an invalid %s=%s instead of guessing", (name, value) => {
    vi.stubEnv(name, value)
    expect(() => getImageOptimizationSettings()).toThrow()
  })
})
