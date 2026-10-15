import sharp from "sharp"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  INLINE_MAX_BYTES,
  INLINE_MAX_CONCURRENT_ENCODES,
  storeIncomingImage,
} from "../src/store-incoming-image"

const mocks = vi.hoisted(() => ({ info: vi.fn() }))

vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info: mocks.info }),
}))

const noisyJpeg = async (width: number, height: number, quality = 95) => {
  const raw = await sharp({
    create: {
      width,
      height,
      channels: 3,
      noise: { type: "gaussian", mean: 128, sigma: 40 },
    },
  })
    .raw()
    .toBuffer()
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality })
    .toBuffer()
}

const createUploader = () => {
  const putObject = vi.fn().mockResolvedValue(undefined)
  return { uploader: { putObject }, putObject }
}

describe("storeIncomingImage", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("encodes a small photo inline and writes it once", async () => {
    const { uploader, putObject } = createUploader()
    const source = await noisyJpeg(1200, 900)

    const result = await storeIncomingImage({
      uploader,
      key: "ws/a",
      bytes: source,
      mimeType: "image/jpeg",
      profile: "media",
    })

    expect(source.length).toBeLessThan(INLINE_MAX_BYTES)
    expect(result.optimized).toBe(true)
    expect(result.originPath).toBe("ws/a")
    expect(result.mimeType).toBe("image/jpeg")
    expect(result.size).toBeLessThan(source.length)
    expect(result.width).toBe(1200)
    expect(result.height).toBe(900)
    expect(putObject).toHaveBeenCalledTimes(1)
    const [, body, options] = putObject.mock.calls[0] as [
      string,
      Buffer,
      { ContentLength: number; ContentType: string; ACL?: string },
    ]
    expect(body.length).toBe(result.size)
    expect(options.ContentLength).toBe(result.size)
    expect(options.ContentType).toBe("image/jpeg")
  })

  it("logs why an image was or was not encoded, with the bytes saved", async () => {
    const { uploader } = createUploader()
    const source = await noisyJpeg(1200, 900)

    const result = await storeIncomingImage({
      uploader,
      key: "ws/log",
      bytes: source,
      mimeType: "image/jpeg",
      profile: "media",
    })

    expect(mocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: "media",
        optimized: true,
        bytesBefore: source.length,
        bytesAfter: result.size,
      }),
      expect.any(String),
    )
  })

  it("passes the acl through to the write", async () => {
    const { uploader, putObject } = createUploader()

    await storeIncomingImage({
      uploader,
      key: "ws/a",
      bytes: await noisyJpeg(800, 600),
      mimeType: "image/jpeg",
      profile: "media",
      acl: "public-read",
    })

    expect(putObject.mock.calls[0]?.[2]).toMatchObject({ ACL: "public-read" })
  })

  it("stores the original, with its dimensions, when it is over the byte gate", async () => {
    const { uploader, putObject } = createUploader()
    const source = await noisyJpeg(2000, 1500, 100)
    expect(source.length).toBeGreaterThan(INLINE_MAX_BYTES)

    const result = await storeIncomingImage({
      uploader,
      key: "ws/big",
      bytes: source,
      mimeType: "image/jpeg",
      profile: "media",
    })

    expect(result).toMatchObject({
      optimized: false,
      skipped: "bytes",
      size: source.length,
      width: 2000,
      height: 1500,
      mimeType: "image/jpeg",
    })
    expect(putObject.mock.calls[0]?.[1]).toBe(source)
  })

  it("stores the original when it is over the pixel gate", async () => {
    const { uploader } = createUploader()
    // 3200x2600 = 8.3 MP, flat so it stays under the byte gate.
    const source = await sharp({
      create: {
        width: 3200,
        height: 2600,
        channels: 3,
        background: "#336699",
      },
    })
      .jpeg()
      .toBuffer()

    const result = await storeIncomingImage({
      uploader,
      key: "ws/mp",
      bytes: source,
      mimeType: "image/jpeg",
      profile: "media",
    })

    expect(source.length).toBeLessThan(INLINE_MAX_BYTES)
    expect(result).toMatchObject({
      optimized: false,
      skipped: "pixels",
      width: 3200,
      height: 2600,
    })
  })

  it("applies the tighter pixel gate to avatars", async () => {
    const { uploader } = createUploader()
    const source = await sharp({
      create: {
        width: 2200,
        height: 2000,
        channels: 3,
        background: "#336699",
      },
    })
      .jpeg()
      .toBuffer()

    const result = await storeIncomingImage({
      uploader,
      key: "ws/avatar",
      bytes: source,
      mimeType: "image/jpeg",
      profile: "avatar",
    })

    expect(result).toMatchObject({ optimized: false, skipped: "pixels" })
  })

  it("never encodes more than the concurrency limit at once", async () => {
    const { uploader } = createUploader()
    const source = await noisyJpeg(1200, 900)

    const results = await Promise.all(
      Array.from({ length: INLINE_MAX_CONCURRENT_ENCODES + 3 }, (_, index) =>
        storeIncomingImage({
          uploader,
          key: `ws/${index}`,
          bytes: source,
          mimeType: "image/jpeg",
          profile: "media",
        }),
      ),
    )

    const busy = results.filter((result) => result.skipped === "busy")
    const optimized = results.filter((result) => result.optimized)
    expect(busy.length).toBeGreaterThan(0)
    expect(optimized.length).toBeLessThanOrEqual(INLINE_MAX_CONCURRENT_ENCODES)
    for (const result of busy) {
      expect(result.size).toBe(source.length)
    }
  })

  it("releases the encode slot after a failure so later images still encode", async () => {
    const { uploader } = createUploader()
    const garbage = Buffer.from("not an image at all")

    for (
      let attempt = 0;
      attempt < INLINE_MAX_CONCURRENT_ENCODES + 2;
      attempt++
    ) {
      await storeIncomingImage({
        uploader,
        key: `ws/bad-${attempt}`,
        bytes: garbage,
        mimeType: "image/jpeg",
        profile: "media",
      })
    }

    const result = await storeIncomingImage({
      uploader,
      key: "ws/good",
      bytes: await noisyJpeg(1200, 900),
      mimeType: "image/jpeg",
      profile: "media",
    })
    expect(result.optimized).toBe(true)
  })

  it("stores an undecodable image as-is", async () => {
    const { uploader, putObject } = createUploader()
    const garbage = Buffer.from("not an image at all")

    const result = await storeIncomingImage({
      uploader,
      key: "ws/bad",
      bytes: garbage,
      mimeType: "image/jpeg",
      profile: "media",
    })

    expect(result).toMatchObject({
      optimized: false,
      size: garbage.length,
      mimeType: "image/jpeg",
    })
    expect(result.width).toBeUndefined()
    expect(putObject.mock.calls[0]?.[1]).toBe(garbage)
  })

  it("keeps the original for the original profile", async () => {
    const { uploader } = createUploader()
    const source = await noisyJpeg(1200, 900)

    const result = await storeIncomingImage({
      uploader,
      key: "ws/doc",
      bytes: source,
      mimeType: "image/jpeg",
      profile: "original",
    })

    expect(result).toMatchObject({
      optimized: false,
      skipped: "profile",
      size: source.length,
    })
  })

  it("keeps non-image bytes untouched", async () => {
    const { uploader } = createUploader()
    const pdf = Buffer.from("%PDF-1.4")

    const result = await storeIncomingImage({
      uploader,
      key: "ws/doc",
      bytes: pdf,
      mimeType: "application/pdf",
      profile: "media",
    })

    expect(result).toMatchObject({
      optimized: false,
      skipped: "mime",
      mimeType: "application/pdf",
      size: pdf.length,
    })
  })

  it("stores the original when the switch is off", async () => {
    vi.stubEnv("STORED_IMAGE_OPTIMIZATION", "off")
    const { uploader } = createUploader()
    const source = await noisyJpeg(1200, 900)

    const result = await storeIncomingImage({
      uploader,
      key: "ws/off",
      bytes: source,
      mimeType: "image/jpeg",
      profile: "media",
    })

    expect(result).toMatchObject({ optimized: false, skipped: "disabled" })
    expect(result.size).toBe(source.length)
  })

  it("stores the original when the encode saves too little", async () => {
    const { uploader } = createUploader()
    const source = await noisyJpeg(1200, 900, 50)

    const result = await storeIncomingImage({
      uploader,
      key: "ws/ratio",
      bytes: source,
      mimeType: "image/jpeg",
      profile: "media",
    })

    expect(result).toMatchObject({ optimized: false, size: source.length })
  })

  it("does not write when there is no uploader", async () => {
    const result = await storeIncomingImage({
      uploader: undefined,
      key: "ws/none",
      bytes: await noisyJpeg(800, 600),
      mimeType: "image/jpeg",
      profile: "media",
    })

    expect(result.originPath).toBe("ws/none")
  })
})
