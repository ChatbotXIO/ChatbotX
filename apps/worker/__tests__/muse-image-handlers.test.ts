import sharp from "sharp"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  aiFindBy: vi.fn(),
  createAIImageModelInstance: vi.fn(),
  generateImage: vi.fn(),
  putObject: vi.fn(),
  readCustomFieldValue: vi.fn(),
  downloadWithByteLimit: vi.fn(),
}))

vi.mock("@chatbotx.io/ai", () => ({
  aiProviders: {
    enum: { openai: "openai", gemini: "gemini", muse: "muse" },
  },
  aiTimeouts: { aiTotal: 30_000 },
}))
vi.mock("@chatbotx.io/ai/server", () => ({
  aiIntegrationService: { findBy: mocks.aiFindBy },
  createAIImageModelInstance: mocks.createAIImageModelInstance,
}))
vi.mock("@chatbotx.io/business", () => ({
  resolveTenantSettings: vi.fn(async () => ({ storageUrl: "https://cdn" })),
}))
vi.mock("@chatbotx.io/business/utils", () => ({
  getPublicFileUrl: (path: string, base: string) => `${base}/${path}`,
}))
vi.mock("ai", () => ({ generateImage: mocks.generateImage }))
vi.mock("../src/env", () => ({
  env: { HEAVY_MAX_IMAGE_BYTES: 10 * 1024 * 1024 },
}))
vi.mock("../src/integration/utils/contact", () => ({
  getIntegrationContext: vi.fn(async () => ({
    storagePrefix: "ws-1",
    uploader: { putObject: mocks.putObject },
  })),
  readCustomFieldValue: mocks.readCustomFieldValue,
}))
vi.mock("../src/heavy/handlers/bounded-download", () => ({
  downloadWithByteLimit: mocks.downloadWithByteLimit,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn() },
}))

const { generateImageOutput } = await import(
  "../src/heavy/handlers/generate-image"
)
const { editImageOutput } = await import("../src/heavy/handlers/edit-image")
const { ExpectedHeavyStepError } = await import("../src/heavy/handlers/errors")

const conversation = { id: "conv-1", workspaceId: "ws-1", contactId: "c-1" }

const webpImage = async () => ({
  uint8Array: new Uint8Array(
    await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 200, g: 30, b: 30 },
      },
    })
      .webp()
      .toBuffer(),
  ),
  mediaType: "image/webp",
})

describe("Muse image heavy steps", () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.aiFindBy.mockResolvedValue({ id: "ai-1" })
    mocks.createAIImageModelInstance.mockReturnValue("image-model")
    const image = await webpImage()
    mocks.generateImage.mockResolvedValue({ image, images: [image] })
  })

  test("generate-image sends size only and stores the WebP output as JPEG", async () => {
    const url = await generateImageOutput({
      conversation,
      contactInbox: { id: "ci-1" },
      step: {
        id: "step-1",
        stepType: "aiGenerateImage",
        provider: "muse",
        model: "muse-image-1.0",
        prompt: "A red apple",
        quality: "hd",
        size: "1024x1536",
        outputFieldId: "1",
      },
    } as never)

    expect(mocks.createAIImageModelInstance).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "muse", modelId: "muse-image-1.0" }),
    )
    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        size: "1024x1536",
        aspectRatio: undefined,
        providerOptions: undefined,
      }),
    )
    expect(mocks.putObject).toHaveBeenCalledWith(
      "ws-1/conversations/conv-1/step-1.jpeg",
      expect.any(Buffer),
      { ContentType: "image/jpeg" },
    )
    expect(url).toBe("https://cdn/ws-1/conversations/conv-1/step-1.jpeg")
  })

  test("edit-image omits size on auto so Muse keeps the input aspect ratio", async () => {
    mocks.readCustomFieldValue.mockResolvedValue("https://example.com/in.png")
    mocks.downloadWithByteLimit.mockResolvedValue({
      buffer: await sharp({
        create: { width: 8, height: 8, channels: 3, background: "#fff" },
      })
        .png()
        .toBuffer(),
    })

    await editImageOutput({
      conversation,
      contactInbox: { id: "ci-1" },
      step: {
        id: "step-2",
        stepType: "aiEditImage",
        provider: "muse",
        model: "muse-image-1.0",
        inputFieldId: "1",
        prompt: "Make it blue",
        size: "auto",
        quality: "auto",
        outputFieldId: "2",
      },
    } as never)

    expect(mocks.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        size: undefined,
        aspectRatio: undefined,
        providerOptions: undefined,
      }),
    )
    expect(mocks.putObject).toHaveBeenCalledWith(
      "ws-1/conversations/conv-1/step-2.jpeg",
      expect.any(Buffer),
      { ContentType: "image/jpeg" },
    )
  })

  test("edit-image rejects a non-image input without calling the provider", async () => {
    mocks.readCustomFieldValue.mockResolvedValue("https://example.com/a.pdf")
    mocks.downloadWithByteLimit.mockResolvedValue({
      buffer: Buffer.from("%PDF-1.4 not an image"),
    })

    await expect(
      editImageOutput({
        conversation,
        contactInbox: { id: "ci-1" },
        step: {
          id: "step-3",
          stepType: "aiEditImage",
          provider: "muse",
          model: "muse-image-1.0",
          inputFieldId: "1",
          prompt: "Make it blue",
          size: "auto",
          quality: "auto",
          outputFieldId: "2",
        },
      } as never),
    ).rejects.toBeInstanceOf(ExpectedHeavyStepError)
    expect(mocks.generateImage).not.toHaveBeenCalled()
  })
})
