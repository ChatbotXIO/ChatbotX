import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  storeIncomingImage: vi.fn(),
  mimeType: { current: "image/jpeg" },
}))

vi.mock("@chatbotx.io/utils/store-incoming-image", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@chatbotx.io/utils/store-incoming-image")
  >()),
  storeIncomingImage: mocks.storeIncomingImage,
}))
vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock("../src/client", () => ({
  getWhatsappClient: vi.fn(() => ({
    retrieveMedia: vi.fn(async () => ({
      url: "https://cdn.example.com/media",
      mime_type: mocks.mimeType.current,
    })),
  })),
}))

const RECEIVED = Buffer.from("received-bytes")
vi.mock("cross-fetch", () => ({
  default: vi.fn(async () => ({
    ok: true,
    body: {},
    headers: { get: () => null },
    arrayBuffer: async () => new Uint8Array(RECEIVED).buffer,
  })),
}))

const { receiveMessage } = await import(
  "../src/handlers/message/incomming-message"
)

const MEDIA_KEY = /^public\/whatsapp\/ws-1\/int-1\/2026\/10\/06\//

const uploader = { putObject: vi.fn() }

const receive = async (message: Record<string, unknown>) => {
  const result = await receiveMessage({
    ctx: {
      auth: { tokens: { accessToken: "test-token" } },
      storagePrefix: "workspace-1",
      mediaStoragePrefix: "public/whatsapp/ws-1/int-1/2026/10/06",
      uploader,
    },
    data: {
      integrationType: "whatsapp",
      integrationIdentifier: "inbox-1",
      payload: {
        phoneID: "phone-1",
        from: "84900000001",
        name: "Alice",
        message: { id: "wamid.test-1", ...message },
      },
    },
  } as never)
  return result.message?.attachments?.[0]
}

const stored = (overrides: Record<string, unknown> = {}) => ({
  originPath: "ignored",
  mimeType: "image/jpeg",
  size: 5000,
  width: 1200,
  height: 900,
  optimized: true,
  ...overrides,
})

describe("WhatsApp media — inline compression", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mimeType.current = "image/jpeg"
  })

  test("a photo message goes through the inline encoder with the media profile", async () => {
    mocks.storeIncomingImage.mockImplementation(
      async ({ key }: { key: string }) => stored({ originPath: key }),
    )

    const attachment = await receive({
      type: "image",
      image: { id: "media-1", mime_type: "image/jpeg" },
    })

    expect(mocks.storeIncomingImage).toHaveBeenCalledWith(
      expect.objectContaining({
        uploader,
        profile: "media",
        mimeType: "image/jpeg",
        acl: "public-read",
        key: expect.stringMatching(MEDIA_KEY),
      }),
    )
    expect(
      Buffer.from(mocks.storeIncomingImage.mock.calls[0]?.[0].bytes),
    ).toEqual(RECEIVED)
    expect(attachment).toMatchObject({
      fileType: "image",
      mimeType: "image/jpeg",
      size: 5000,
      width: 1200,
      height: 900,
      isPhotoMessage: true,
      optimized: true,
      originPath: expect.stringMatching(MEDIA_KEY),
    })
  })

  test("the encoded mime type replaces the declared one", async () => {
    mocks.mimeType.current = "image/png"
    mocks.storeIncomingImage.mockResolvedValue(
      stored({ mimeType: "image/jpeg" }),
    )

    const attachment = await receive({
      type: "image",
      image: { id: "media-1b", mime_type: "image/png" },
    })

    expect(attachment?.mimeType).toBe("image/jpeg")
  })

  test("an image sent as a document is stored with the original profile", async () => {
    mocks.storeIncomingImage.mockResolvedValue(
      stored({ optimized: false, skipped: "profile", size: 9000 }),
    )

    const attachment = await receive({
      type: "document",
      document: {
        id: "media-2",
        mime_type: "image/jpeg",
        filename: "scan.jpg",
      },
    })

    expect(mocks.storeIncomingImage).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "original" }),
    )
    expect(attachment).toMatchObject({ fileType: "file", size: 9000 })
    expect(attachment?.optimized).toBeFalsy()
  })

  test("a photo that was not encoded is left for the background job", async () => {
    mocks.storeIncomingImage.mockResolvedValue(
      stored({ optimized: false, skipped: "bytes", size: 4_000_000 }),
    )

    const attachment = await receive({
      type: "image",
      image: { id: "media-3", mime_type: "image/jpeg" },
    })

    expect(attachment).toMatchObject({ isPhotoMessage: true, size: 4_000_000 })
    expect(attachment?.optimized).toBeFalsy()
  })

  test("non-image media does not report dimensions", async () => {
    mocks.mimeType.current = "audio/ogg"
    mocks.storeIncomingImage.mockResolvedValue({
      originPath: "k",
      mimeType: "audio/ogg",
      size: 14,
      optimized: false,
      skipped: "mime",
    })

    const attachment = await receive({
      type: "audio",
      audio: { id: "media-4", mime_type: "audio/ogg", voice: false },
    })

    expect(attachment).toMatchObject({ fileType: "audio", size: 14 })
    expect(attachment).not.toHaveProperty("width")
  })

  test("a failed store surfaces as a download failure", async () => {
    mocks.storeIncomingImage.mockRejectedValue(new Error("r2 down"))

    await expect(
      receive({
        type: "image",
        image: { id: "media-5", mime_type: "image/jpeg" },
      }),
    ).rejects.toThrow("Unable to fetch media info")
  })
})
