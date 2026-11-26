import sharp from "sharp"
import { describe, expect, test } from "vitest"
import {
  FEED_IMAGE_MAX_BYTES,
  FEED_IMAGE_OUTPUT_MAX_SIDE,
  reencodeUntrustedImage,
  sniffImageFormat,
} from "../src/net/safe-image"
import { FeedImageImportError } from "../src/social-post-feed/image-importer"

const solid = (width: number, height: number, channels: 3 | 4 = 3) =>
  sharp({
    create: {
      background: {
        b: 40,
        g: 80,
        r: 120,
        ...(channels === 4 ? { alpha: 0.5 } : {}),
      },
      channels,
      height,
      width,
    },
  })

const codeOf = async (bytes: Buffer) => {
  try {
    await reencodeUntrustedImage(bytes)
    return null
  } catch (error) {
    expect(error).toBeInstanceOf(FeedImageImportError)
    return (error as FeedImageImportError).code
  }
}

describe("sniffImageFormat", () => {
  test("decides from the magic bytes", async () => {
    expect(sniffImageFormat(await solid(2, 2).jpeg().toBuffer())).toBe("jpeg")
    expect(sniffImageFormat(await solid(2, 2).png().toBuffer())).toBe("png")
    expect(sniffImageFormat(await solid(2, 2).webp().toBuffer())).toBe("webp")
    expect(sniffImageFormat(await solid(2, 2).gif().toBuffer())).toBe("gif")
    expect(
      sniffImageFormat(
        Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
      ),
    ).toBeNull()
    expect(sniffImageFormat(Buffer.from("<!doctype html><html>"))).toBeNull()
  })
})

describe("reencodeUntrustedImage", () => {
  test("re-encodes a JPEG, stripping metadata, and shrinks it to 2048 px", async () => {
    const source = await solid(3000, 1500)
      .withExif({ IFD0: { Copyright: "secret" } })
      .jpeg()
      .toBuffer()

    const result = await reencodeUntrustedImage(source)

    expect(result.mimeType).toBe("image/jpeg")
    expect(Math.max(result.width, result.height)).toBe(
      FEED_IMAGE_OUTPUT_MAX_SIDE,
    )
    const meta = await sharp(result.bytes).metadata()
    expect(meta.exif).toBeUndefined()
    expect(meta.format).toBe("jpeg")
  })

  test("keeps transparency as PNG, takes the first frame of a GIF, converts WebP to JPEG", async () => {
    const png = await reencodeUntrustedImage(
      await solid(20, 20, 4).png().toBuffer(),
    )
    expect(png.mimeType).toBe("image/png")
    const gif = await reencodeUntrustedImage(
      await solid(20, 20).gif().toBuffer(),
    )
    expect(["image/jpeg", "image/png"]).toContain(gif.mimeType)
    const webp = await reencodeUntrustedImage(
      await solid(20, 20).webp().toBuffer(),
    )
    expect(webp.mimeType).toBe("image/jpeg")
  })

  test("refuses SVG, HTML, text and an empty body (never trusts a content type)", async () => {
    expect(
      await codeOf(
        Buffer.from(
          "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>",
        ),
      ),
    ).toBe("notAnImage")
    expect(await codeOf(Buffer.from("<html><body>hi</body></html>"))).toBe(
      "notAnImage",
    )
    expect(await codeOf(Buffer.alloc(0))).toBe("notAnImage")
  })

  test("refuses a body over 8 MB before reading it", async () => {
    expect(await codeOf(Buffer.alloc(FEED_IMAGE_MAX_BYTES + 1, 0xff))).toBe(
      "tooLarge",
    )
  })

  test("refuses a picture whose header is too large, without decoding it (pixel bomb)", async () => {
    const bomb = await solid(6001, 8).png({ compressionLevel: 9 }).toBuffer()
    expect(bomb.length).toBeLessThan(100_000)
    expect(await codeOf(bomb)).toBe("tooManyPixels")
    const tall = await solid(8, 6001).png({ compressionLevel: 9 }).toBuffer()
    expect(await codeOf(tall)).toBe("tooManyPixels")
  })

  test("a polyglot (PNG header with a script after the data) is re-encoded to pixels only", async () => {
    const png = await solid(10, 10).png().toBuffer()
    const polyglot = Buffer.concat([
      png,
      Buffer.from("<script>alert(1)</script>"),
    ])

    const result = await reencodeUntrustedImage(polyglot)

    expect(result.bytes.includes(Buffer.from("<script>"))).toBe(false)
    expect(result.bytes.length).toBeGreaterThan(0)
  })

  test("a JPEG header with a broken body is refused as undecodable", async () => {
    const jpeg = await solid(200, 200).jpeg().toBuffer()
    const truncated = jpeg.subarray(0, Math.floor(jpeg.length / 3))
    expect(await codeOf(truncated)).toBe("decodeFailed")
    expect(await codeOf(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]))).toBe(
      "decodeFailed",
    )
  })
})

describe("sharp process-wide settings", () => {
  test("re-encoding leaves them alone", async () => {
    const concurrencyBefore = sharp.concurrency()
    const cacheBefore = sharp.cache().memory.max
    await reencodeUntrustedImage(await solid(8, 8).png().toBuffer())
    expect(sharp.concurrency()).toBe(concurrencyBefore)
    expect(sharp.cache().memory.max).toBe(cacheBefore)
  })
})
