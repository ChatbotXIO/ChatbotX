import { randomBytes } from "node:crypto"
import sharp from "sharp"
import { describe, expect, test } from "vitest"
import {
  inspectImage,
  renderJpegWithinBytes,
  renderVideoPlaceholderJpeg,
} from "../src/image-renditions"

const TIMEOUT_MS = 60_000
const SIZE = 1800

/** Incompressible noise, so the PNG is large and the JPEG has to work to shrink. */
const noisyPng = async (alpha = false) => {
  const channels = alpha ? 4 : 3
  return await sharp(randomBytes(SIZE * SIZE * channels), {
    raw: { width: SIZE, height: SIZE, channels },
  })
    .png()
    .toBuffer()
}

describe("image renditions", { timeout: TIMEOUT_MS }, () => {
  test("inspectImage names the format and rejects non-images", async () => {
    const png = await noisyPng()
    expect(await inspectImage(png)).toMatchObject({
      format: "png",
      width: SIZE,
      animated: false,
    })
    expect(await inspectImage(Buffer.from("<html>502</html>"))).toBeNull()
  })

  test("renderJpegWithinBytes fits a large PNG under the cap as a JPEG", async () => {
    const png = await noisyPng()
    expect(png.length).toBeGreaterThan(5_000_000)

    const preview = await renderJpegWithinBytes({
      bytes: png,
      maxBytes: 1_000_000,
      maxDimensions: [1024, 768, 512],
      qualities: [80, 70, 60, 50],
    })

    expect(preview).not.toBeNull()
    expect(preview?.bytes.length).toBeLessThanOrEqual(1_000_000)
    expect(preview?.width).toBeLessThanOrEqual(1024)
    expect((await inspectImage(preview?.bytes as Buffer))?.format).toBe("jpeg")
  })

  test("a transparent PNG is flattened, not rejected", async () => {
    const rendition = await renderJpegWithinBytes({
      bytes: await noisyPng(true),
      maxBytes: 10_000_000,
      maxDimensions: [1024],
      qualities: [80],
    })
    expect((await inspectImage(rendition?.bytes as Buffer))?.format).toBe(
      "jpeg",
    )
  })

  test("returns null when no step of the grid fits, or the bytes are not an image", async () => {
    expect(
      await renderJpegWithinBytes({
        bytes: await noisyPng(),
        maxBytes: 100,
        maxDimensions: [256],
        qualities: [50],
      }),
    ).toBeNull()
    expect(
      await renderJpegWithinBytes({
        bytes: Buffer.from("nope"),
        maxBytes: 1_000_000,
        maxDimensions: [256],
        qualities: [50],
      }),
    ).toBeNull()
  })

  test("the video placeholder is a small JPEG well under LINE's 1 MB preview cap", async () => {
    const jpeg = await renderVideoPlaceholderJpeg()
    expect(jpeg.length).toBeLessThan(200_000)
    expect((await inspectImage(jpeg))?.format).toBe("jpeg")
  })
})
