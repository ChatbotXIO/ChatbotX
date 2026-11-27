import { aiSegmentImageDefaultFn } from "@chatbotx.io/flow-config"
import sharp from "sharp"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  aiFindBy: vi.fn(),
  downloadWithByteLimit: vi.fn(),
  env: { HEAVY_MAX_IMAGE_BYTES: 10 * 1024 * 1024 },
  getIntegrationContext: vi.fn(),
  loggerInfo: vi.fn(),
  putObject: vi.fn(),
  readCustomFieldValue: vi.fn(),
  segmentImage: vi.fn(),
}))

vi.mock("@chatbotx.io/ai", () => ({
  aiProviders: { enum: { muse: "muse" } },
  aiTimeouts: { aiTotal: 30_000 },
}))
vi.mock("@chatbotx.io/ai/server", () => ({
  aiIntegrationService: { findBy: mocks.aiFindBy },
}))
vi.mock("@chatbotx.io/ai/sam", () => ({
  segmentImage: mocks.segmentImage,
}))
vi.mock("@chatbotx.io/business", () => ({
  resolveTenantSettings: vi.fn(async () => ({ storageUrl: "https://cdn" })),
}))
vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: (path: string, base: string) => `${base}/${path}`,
}))
vi.mock("../src/env", () => ({ env: mocks.env }))
vi.mock("../src/integration/utils/contact", () => ({
  getIntegrationContext: mocks.getIntegrationContext,
  readCustomFieldValue: mocks.readCustomFieldValue,
}))
vi.mock("../src/heavy/handlers/bounded-download", () => ({
  downloadWithByteLimit: mocks.downloadWithByteLimit,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: mocks.loggerInfo, warn: vi.fn() },
}))

const { SEGMENT_MAX_INPUT_PIXELS, segmentImageOutput } = await import(
  "../src/heavy/handlers/segment-image"
)
const { ExpectedHeavyStepError } = await import("../src/heavy/handlers/errors")

const JPG_KEY_PATTERN = /\.jpg$/
const CROP_TOO_LARGE = /^Cropped image too large: /

const conversation = { id: "conv-1", workspaceId: "ws-1", contactId: "c-1" }

type BoxSpec = {
  bottom: number
  confidence?: number
  left: number
  objectId?: number
  right: number
  top: number
}

function box(spec: BoxSpec) {
  return { objectId: 0, ...spec }
}

/**
 * An RGBA PNG whose red channel is each pixel's row-major index, so a crop
 * can be checked pixel by pixel. Alpha is just below opaque: real
 * transparency keeps the crop a lossless PNG.
 */
async function gridPng(width: number, height: number): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 4)
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    data[pixel * 4] = pixel
    data[pixel * 4 + 3] = 254
  }
  return await sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
}

async function solidPng(width: number, height: number): Promise<Buffer> {
  return await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 30, b: 30 },
    },
  })
    .png()
    .toBuffer()
}

function makeStep(
  overrides: Parameters<typeof aiSegmentImageDefaultFn>[0] = {},
) {
  return aiSegmentImageDefaultFn({
    id: "step-1",
    inputFieldId: "field-in",
    target: "product box",
    outputFieldId: "field-out",
    ...overrides,
  })
}

function run(
  overrides: Parameters<typeof aiSegmentImageDefaultFn>[0] = {},
  jobId = "heavy-aiSegmentImage-run-a",
) {
  return segmentImageOutput({
    contactInbox: { id: "ci-1" },
    conversation,
    jobId,
    step: makeStep(overrides),
  } as never)
}

async function uploadedImage(): Promise<{
  alpha: number[]
  channels: number
  height: number
  red: number[]
  width: number
}> {
  const [, buffer] = mocks.putObject.mock.calls.at(-1) ?? []
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true })
  const alpha: number[] = []
  const red: number[] = []
  for (let index = 0; index < data.length; index += info.channels) {
    red.push(data[index] ?? 0)
    alpha.push(data[index + info.channels - 1] ?? 0)
  }
  return {
    alpha,
    channels: info.channels,
    height: info.height,
    red,
    width: info.width,
  }
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error("Expected a rejection")
}

describe("segmentImageOutput", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.env.HEAVY_MAX_IMAGE_BYTES = 10 * 1024 * 1024
    mocks.aiFindBy.mockResolvedValue({
      auth: { authType: "secretText", secretText: "muse-key" },
    })
    mocks.readCustomFieldValue.mockResolvedValue("https://example.com/in.png")
    mocks.downloadWithByteLimit.mockResolvedValue({
      buffer: await gridPng(4, 4),
    })
    mocks.putObject.mockResolvedValue(undefined)
    mocks.getIntegrationContext.mockResolvedValue({
      storagePrefix: "ws-1",
      uploader: { putObject: mocks.putObject },
    })
    mocks.segmentImage.mockResolvedValue({
      kind: "matched",
      boxes: [box({ left: 1, top: 1, right: 3, bottom: 3 })],
    })
  })

  test("crops the matched box and uses the fixed Muse key", async () => {
    const result = await run()

    expect(mocks.aiFindBy).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      provider: "muse",
    })
    expect(mocks.segmentImage).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "muse-key",
        mimeType: "image/png",
        sourceSize: { width: 4, height: 4 },
        target: "product box",
      }),
    )
    expect(mocks.putObject).toHaveBeenCalledWith(
      "ws-1/conversations/conv-1/heavy-aiSegmentImage-run-a.png",
      expect.any(Buffer),
      { ContentType: "image/png" },
    )
    expect(result).toEqual({
      status: "success",
      outputValues: [
        {
          customFieldId: "field-out",
          value:
            "https://cdn/ws-1/conversations/conv-1/heavy-aiSegmentImage-run-a.png",
        },
      ],
    })

    // Pixels 5, 6, 9 and 10 of the 4×4 grid.
    expect(await uploadedImage()).toMatchObject({
      height: 2,
      red: [5, 6, 9, 10],
      width: 2,
    })
  })

  test("largest crops to the largest box, not the first", async () => {
    mocks.segmentImage.mockResolvedValue({
      kind: "matched",
      boxes: [
        box({ objectId: 0, left: 0, top: 0, right: 1, bottom: 1 }),
        box({ objectId: 1, left: 1, top: 2, right: 4, bottom: 4 }),
        box({ objectId: 2, left: 3, top: 0, right: 4, bottom: 2 }),
      ],
    })

    const result = await run({ detailsOutputFieldId: "field-details" })

    expect(await uploadedImage()).toMatchObject({
      height: 2,
      red: [9, 10, 11, 13, 14, 15],
      width: 3,
    })
    const details = JSON.parse(
      result.status === "success" ? (result.outputValues[1]?.value ?? "") : "",
    )
    expect(details.boxes).toEqual([{ left: 1, top: 2, right: 4, bottom: 4 }])
  })

  test("all crops the area covering every box and reports every match", async () => {
    mocks.segmentImage.mockResolvedValue({
      kind: "matched",
      boxes: [
        box({
          objectId: 0,
          left: 0,
          top: 0,
          right: 1,
          bottom: 1,
          confidence: 0.9,
        }),
        box({ objectId: 1, left: 2, top: 1, right: 3, bottom: 3 }),
      ],
    })

    const result = await run({
      matchSelection: "all",
      detailsOutputFieldId: "field-details",
    })

    expect(await uploadedImage()).toMatchObject({
      height: 3,
      red: [0, 1, 2, 4, 5, 6, 8, 9, 10],
      width: 3,
    })
    expect(result.status === "success" && result.outputValues[1]).toEqual({
      customFieldId: "field-details",
      value: JSON.stringify({
        count: 2,
        boxes: [
          { left: 0, top: 0, right: 1, bottom: 1, confidence: 0.9 },
          { left: 2, top: 1, right: 3, bottom: 3 },
        ],
        crop: { left: 0, top: 0, right: 3, bottom: 3 },
        source: { width: 4, height: 4 },
      }),
    })
  })

  test("returns skip and writes nothing when no object matches", async () => {
    mocks.segmentImage.mockResolvedValue({ kind: "no_match" })

    await expect(run()).resolves.toEqual({ status: "skip" })
    expect(mocks.putObject).not.toHaveBeenCalled()
  })

  test("rejects a non-image download", async () => {
    mocks.downloadWithByteLimit.mockResolvedValue({
      buffer: Buffer.from("not an image"),
    })

    expect(await rejection(run())).toBeInstanceOf(ExpectedHeavyStepError)
    expect(mocks.segmentImage).not.toHaveBeenCalled()
  })

  test("downloads under the byte ceiling", async () => {
    await run()

    expect(mocks.downloadWithByteLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        maxBytes: 10 * 1024 * 1024,
        url: "https://example.com/in.png",
      }),
    )
  })

  test("rejects a normalized image over the byte ceiling", async () => {
    mocks.env.HEAVY_MAX_IMAGE_BYTES = 10

    expect(await rejection(run())).toBeInstanceOf(ExpectedHeavyStepError)
    expect(mocks.segmentImage).not.toHaveBeenCalled()
  })

  test("rejects a crop over the byte ceiling before uploading it", async () => {
    mocks.segmentImage.mockImplementation(() => {
      // Lets the normalized image through, then bounds the crop.
      mocks.env.HEAVY_MAX_IMAGE_BYTES = 10
      return Promise.resolve({
        kind: "matched",
        boxes: [box({ left: 0, top: 0, right: 4, bottom: 4 })],
      })
    })

    const error = await rejection(run())

    expect(error).toBeInstanceOf(ExpectedHeavyStepError)
    expect((error as Error).message).toMatch(CROP_TOO_LARGE)
    expect(mocks.putObject).not.toHaveBeenCalled()
  })

  test("rejects an image over the pixel ceiling before decoding", async () => {
    mocks.downloadWithByteLimit.mockResolvedValue({
      buffer: await solidPng(5001, 5000),
    })

    const error = await rejection(run())
    expect(error).toBeInstanceOf(ExpectedHeavyStepError)
    // The pixel ceiling, not "not an image": the header is read unbounded.
    expect((error as Error).message).toBe(
      `Input image exceeds ${SEGMENT_MAX_INPUT_PIXELS} pixels`,
    )
    expect(mocks.segmentImage).not.toHaveBeenCalled()
  })

  test.each([
    6, 8,
  ])("applies EXIF orientation %i before SAM sees the image", async (orientation) => {
    mocks.downloadWithByteLimit.mockResolvedValue({
      buffer: await sharp({
        create: { width: 4, height: 2, channels: 3, background: "#fff" },
      })
        .jpeg()
        .withMetadata({ orientation })
        .toBuffer(),
    })
    mocks.segmentImage.mockResolvedValue({
      kind: "matched",
      boxes: [box({ left: 0, top: 0, right: 2, bottom: 4 })],
    })

    await run()

    const sent = mocks.segmentImage.mock.calls[0]?.[0]
    const metadata = await sharp(sent.image).metadata()
    expect({ width: metadata.width, height: metadata.height }).toEqual({
      width: 2,
      height: 4,
    })
    expect(await uploadedImage()).toMatchObject({ width: 2, height: 4 })
  })

  test("keeps transparency-capable sources as PNG", async () => {
    mocks.downloadWithByteLimit.mockResolvedValue({
      buffer: await sharp({
        create: {
          width: 4,
          height: 4,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer(),
    })

    await run()

    expect(mocks.segmentImage).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "image/png" }),
    )
  })

  test("different runs of the same step write different objects", async () => {
    await run({}, "heavy-aiSegmentImage-run-a")
    await run({}, "heavy-aiSegmentImage-run-b")

    const keys = mocks.putObject.mock.calls.map(([key]) => key)
    expect(keys).toEqual([
      "ws-1/conversations/conv-1/heavy-aiSegmentImage-run-a.png",
      "ws-1/conversations/conv-1/heavy-aiSegmentImage-run-b.png",
    ])
  })

  test("rejects an empty source field", async () => {
    mocks.readCustomFieldValue.mockResolvedValue("")

    expect(await rejection(run())).toBeInstanceOf(ExpectedHeavyStepError)
  })

  test("rejects a missing Muse integration", async () => {
    mocks.aiFindBy.mockResolvedValue(null)

    expect(await rejection(run())).toBeInstanceOf(ExpectedHeavyStepError)
  })

  test("propagates Meta 429 and timeouts for the retry policy", async () => {
    const rateLimited = Object.assign(new Error("rate limited"), {
      retryable: true,
      status: 429,
    })
    mocks.segmentImage.mockRejectedValueOnce(rateLimited)
    expect(await rejection(run())).toBe(rateLimited)

    const timeout = new DOMException("deadline", "AbortError")
    mocks.segmentImage.mockRejectedValueOnce(timeout)
    expect(await rejection(run())).toBe(timeout)
  })

  test("propagates storage failures for the retry policy", async () => {
    const storageError = new Error("S3 unavailable")
    mocks.putObject.mockRejectedValueOnce(storageError)

    expect(await rejection(run())).toBe(storageError)
  })

  test("accepts an image exactly at the pixel ceiling", async () => {
    mocks.downloadWithByteLimit.mockResolvedValue({
      buffer: await solidPng(5000, 5000),
    })
    mocks.segmentImage.mockResolvedValue({ kind: "no_match" })

    await expect(run()).resolves.toEqual({ status: "skip" })
  })

  test("reports which image check failed", async () => {
    mocks.downloadWithByteLimit.mockResolvedValue({
      buffer: Buffer.from("not an image"),
    })

    expect(((await rejection(run())) as Error).message).toBe(
      "Input is not a supported image",
    )
  })

  test.each([
    [
      "webp",
      () =>
        sharp({
          create: { width: 4, height: 4, channels: 3, background: "#f00" },
        })
          .webp()
          .toBuffer(),
      "image/jpeg",
    ],
    [
      "gif",
      () =>
        sharp({
          create: { width: 4, height: 4, channels: 3, background: "#f00" },
        })
          .gif()
          .toBuffer(),
      "image/jpeg",
    ],
    [
      "opaque RGBA png",
      () =>
        sharp({
          create: {
            width: 4,
            height: 4,
            channels: 4,
            background: { r: 255, g: 0, b: 0, alpha: 1 },
          },
        })
          .png()
          .toBuffer(),
      "image/jpeg",
    ],
    [
      "jpeg",
      () =>
        sharp({
          create: { width: 4, height: 4, channels: 3, background: "#f00" },
        })
          .jpeg()
          .toBuffer(),
      "image/jpeg",
    ],
  ])("sends and writes opaque %s input as JPEG", async (_format, make, sentAs) => {
    mocks.downloadWithByteLimit.mockResolvedValue({ buffer: await make() })

    await run()

    expect(mocks.segmentImage).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: sentAs }),
    )
    const [key, , options] = mocks.putObject.mock.calls[0] ?? []
    expect(key).toMatch(JPG_KEY_PATTERN)
    expect(options).toEqual({ ContentType: "image/jpeg" })
    expect(
      (await sharp(mocks.putObject.mock.calls[0]?.[1]).metadata()).format,
    ).toBe("jpeg")
  })

  test("rejects an unsupported but valid image format", async () => {
    mocks.downloadWithByteLimit.mockResolvedValue({
      buffer: await sharp({
        create: { width: 4, height: 4, channels: 3, background: "#fff" },
      })
        .tiff()
        .toBuffer(),
    })

    expect(await rejection(run())).toBeInstanceOf(ExpectedHeavyStepError)
  })

  test("gives SAM the pixel size of the exact bytes it later crops", async () => {
    mocks.downloadWithByteLimit.mockResolvedValue({
      buffer: await sharp({
        create: { width: 6, height: 3, channels: 3, background: "#fff" },
      })
        .jpeg()
        .toBuffer(),
    })

    await run()

    const sent = mocks.segmentImage.mock.calls[0]?.[0]
    const sentMeta = await sharp(sent.image).metadata()
    expect(sent.sourceSize).toEqual({
      width: sentMeta.width,
      height: sentMeta.height,
    })
    expect(sent.sourceSize).toEqual({ width: 6, height: 3 })
  })

  test("keeps the source's own transparency in the crop", async () => {
    mocks.downloadWithByteLimit.mockResolvedValue({
      buffer: await sharp({
        create: {
          width: 4,
          height: 4,
          channels: 4,
          background: { r: 10, g: 20, b: 30, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer(),
    })

    await run()

    const { alpha, channels } = await uploadedImage()
    expect(channels).toBe(4)
    expect(alpha).toEqual([128, 128, 128, 128])
    expect(mocks.putObject.mock.calls[0]?.[2]).toEqual({
      ContentType: "image/png",
    })
  })

  test("crops a box that touches the right and bottom edges", async () => {
    mocks.segmentImage.mockResolvedValue({
      kind: "matched",
      boxes: [box({ left: 2, top: 2, right: 4, bottom: 4 })],
    })

    await run()

    expect(await uploadedImage()).toMatchObject({
      height: 2,
      red: [10, 11, 14, 15],
      width: 2,
    })
  })

  test("crops a box covering the whole image", async () => {
    mocks.segmentImage.mockResolvedValue({
      kind: "matched",
      boxes: [box({ left: 0, top: 0, right: 4, bottom: 4 })],
    })

    await run()

    expect(await uploadedImage()).toMatchObject({
      height: 4,
      red: Array.from({ length: 16 }, (_, index) => index),
      width: 4,
    })
  })

  test("all covers overlapping boxes once", async () => {
    mocks.segmentImage.mockResolvedValue({
      kind: "matched",
      boxes: [
        box({ objectId: 0, left: 0, top: 0, right: 3, bottom: 1 }),
        box({ objectId: 1, left: 1, top: 0, right: 4, bottom: 1 }),
      ],
    })

    await run({ matchSelection: "all" })

    expect(await uploadedImage()).toMatchObject({
      height: 1,
      red: [0, 1, 2, 3],
      width: 4,
    })
  })

  test("largest keeps the first of equally large boxes", async () => {
    mocks.segmentImage.mockResolvedValue({
      kind: "matched",
      boxes: [
        box({ objectId: 0, left: 0, top: 0, right: 2, bottom: 1 }),
        box({ objectId: 1, left: 2, top: 3, right: 4, bottom: 4 }),
      ],
    })

    const result = await run({ detailsOutputFieldId: "field-details" })

    const details = JSON.parse(
      result.status === "success" ? (result.outputValues[1]?.value ?? "") : "",
    )
    expect(details.boxes).toEqual([{ left: 0, top: 0, right: 2, bottom: 1 }])
  })

  test("details hold boxes, the crop and sizes only", async () => {
    const result = await run({ detailsOutputFieldId: "field-details" })

    const value =
      result.status === "success" ? (result.outputValues[1]?.value ?? "") : ""
    expect(JSON.parse(value)).toEqual({
      count: 1,
      boxes: [{ left: 1, top: 1, right: 3, bottom: 3 }],
      crop: { left: 1, top: 1, right: 3, bottom: 3 },
      source: { width: 4, height: 4 },
    })
    expect(value).not.toContain("objectId")
  })

  test("a retry of the same run writes the same object with the same bytes", async () => {
    await run()
    await run()

    const [first, second] = mocks.putObject.mock.calls
    expect(first?.[0]).toBe(second?.[0])
    expect(Buffer.compare(first?.[1], second?.[1])).toBe(0)
  })

  test.each([
    ["an ftp URL", "ftp://example.com/in.png"],
    ["plain text", "a red car"],
    ["a missing value", null],
    ["whitespace", "   "],
  ])("rejects a source field holding %s", async (_name, value) => {
    mocks.readCustomFieldValue.mockResolvedValue(value)

    expect(((await rejection(run())) as Error).message).toBe(
      "Source field has no image URL",
    )
    expect(mocks.downloadWithByteLimit).not.toHaveBeenCalled()
  })

  test("trims the source URL and reads the configured field", async () => {
    mocks.readCustomFieldValue.mockResolvedValue("  http://example.com/a.png  ")

    await run()

    expect(mocks.readCustomFieldValue).toHaveBeenCalledWith({
      contactId: "c-1",
      customFieldId: "field-in",
    })
    expect(mocks.downloadWithByteLimit).toHaveBeenCalledWith(
      expect.objectContaining({ url: "http://example.com/a.png" }),
    )
  })

  test("propagates a download rejection (unsafe URL, size, status)", async () => {
    const unsafe = new ExpectedHeavyStepError("Unsafe image URL")
    mocks.downloadWithByteLimit.mockRejectedValueOnce(unsafe)

    expect(await rejection(run())).toBe(unsafe)
    expect(mocks.segmentImage).not.toHaveBeenCalled()
  })

  test("rejects a Muse integration without a usable API key", async () => {
    mocks.aiFindBy.mockResolvedValue({ auth: { authType: "oauth2" } })

    expect(((await rejection(run())) as Error).message).toBe(
      "Muse integration has no API key",
    )
    expect(mocks.downloadWithByteLimit).not.toHaveBeenCalled()
  })

  test("rejects a conversation without an integration context", async () => {
    mocks.getIntegrationContext.mockResolvedValueOnce(null)

    expect(((await rejection(run())) as Error).message).toBe(
      "Integration context not found",
    )
  })

  test("aborts the SAM call at the AI deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      mocks.segmentImage.mockImplementation(
        ({ signal }: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            )
          }),
      )
      const pending = rejection(run())
      await vi.waitFor(() => expect(mocks.segmentImage).toHaveBeenCalled())

      await vi.advanceTimersByTimeAsync(30_000)

      expect(await pending).toMatchObject({ name: "AbortError" })
    } finally {
      vi.useRealTimers()
    }
  })

  test("clears the deadline once the run finishes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      await run()
      const { signal } = mocks.segmentImage.mock.calls[0]?.[0] ?? {}

      await vi.advanceTimersByTimeAsync(60_000)

      expect(signal?.aborted).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  test("logs the run context and match count", async () => {
    await run({ detailsOutputFieldId: "field-details" })

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      {
        contactInboxId: "ci-1",
        conversationId: "conv-1",
        jobId: "heavy-aiSegmentImage-run-a",
        matchSelection: "largest",
        matchedCount: 1,
        stepId: "step-1",
        workspaceId: "ws-1",
      },
      "[ai-segment-image] Cropped image",
    )
  })
})
