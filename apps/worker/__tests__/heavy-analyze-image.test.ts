import type { HeavyJobAnalyzeImage } from "@chatbotx.io/worker-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  createReplyModel: vi.fn(),
  generateText: vi.fn(),
  getObject: vi.fn(),
  headObject: vi.fn(),
}))

vi.mock("@chatbotx.io/ai", () => ({ aiTimeouts: { aiStep: 30_000 } }))
vi.mock("@chatbotx.io/filesystem", () => ({
  uploader: {
    getObject: mocks.getObject,
    headObject: mocks.headObject,
  },
}))
vi.mock("ai", () => ({ generateText: mocks.generateText }))
vi.mock("../src/env", () => ({
  env: { HEAVY_MAX_IMAGE_BYTES: 1024 * 1024 },
}))
vi.mock("../src/lib/ai/reply-model", () => ({
  createReplyModel: mocks.createReplyModel,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { warn: vi.fn() },
}))

const { analyzeImage } = await import("../src/heavy/handlers/analyze-image")

const jobData: HeavyJobAnalyzeImage["data"] = {
  mimeType: "image/jpeg",
  originPath: "workspace/image.jpg",
  prompt: "Describe the image",
  providerInfo: { model: "gpt-vision", provider: "openai" },
  sizeBytes: 3,
  workspaceId: "workspace-1",
}

describe("analyzeImage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.headObject.mockResolvedValue({ ContentLength: 3 })
    mocks.getObject.mockResolvedValue(new Uint8Array([1, 2, 3]))
    mocks.createReplyModel.mockResolvedValue({ model: "vision-model" })
    mocks.generateText.mockResolvedValue({ text: "  A photo  " })
  })

  test("sends the image as a file part with its exact MIME type", async () => {
    await expect(analyzeImage(jobData)).resolves.toEqual({
      analysis: "A photo",
    })

    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Describe the image" },
              {
                data: new Uint8Array([1, 2, 3]),
                mediaType: "image/jpeg",
                type: "file",
              },
            ],
          },
        ],
      }),
    )
  })
})
