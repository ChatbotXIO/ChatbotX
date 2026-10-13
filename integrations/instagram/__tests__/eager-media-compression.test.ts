import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  storeIncomingImage: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock("@chatbotx.io/utils/store-incoming-image", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@chatbotx.io/utils/store-incoming-image")
  >()),
  storeIncomingImage: mocks.storeIncomingImage,
}))
vi.mock("cross-fetch", () => ({ default: mocks.fetch }))

const { receiveMessage } = await import(
  "../src/handlers/message/incoming-message"
)

const META_CDN_URL = "https://scontent.xx.fbcdn.net/v/t1/photo.jpg?sig=abc"
const CHANNEL_MEDIA_KEY = /^public\/instagram\/ws-1\/int-1\/2026\/10\/06\//
const uploader = { putObject: vi.fn() }

const receive = (attachments: { type: string; payload: { url: string } }[]) =>
  receiveMessage({
    ctx: {
      storagePrefix: "workspace-1",
      mediaStoragePrefix: "public/instagram/ws-1/int-1/2026/10/06",
      uploader,
      auth: {
        clientId: "app-123",
        tokens: { accessToken: "page-token" },
        metadata: {
          igId: "ig-123",
          igName: "Test IG",
          pageId: "page-123",
          version: "v23.0",
        },
      },
    },
    data: {
      integrationType: "instagram",
      integrationIdentifier: "ig-123",
      payload: {
        object: "instagram",
        entry: [
          {
            id: "ig-123",
            time: 1_700_000_000,
            messaging: [
              {
                sender: { id: "user-1" },
                recipient: { id: "ig-123" },
                timestamp: 1_700_000_000,
                message: { mid: "mid-1", attachments },
              },
            ],
          },
        ],
      },
    },
  } as never)

const serve = (contentType: string) =>
  mocks.fetch.mockResolvedValue(
    new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "content-type": contentType },
    }),
  )

const stored = (overrides: Record<string, unknown> = {}) => ({
  originPath: "ignored",
  mimeType: "image/jpeg",
  size: 4000,
  width: 640,
  height: 480,
  optimized: true,
  ...overrides,
})

describe("instagram eager media — inline compression", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Eager only when the channel is not on the lazy list.
    vi.stubEnv("LIVE_MEDIA_LAZY_CHANNELS", "")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("a photo goes through the inline encoder with the media profile", async () => {
    serve("image/jpeg")
    mocks.storeIncomingImage.mockResolvedValue(stored())

    const result = await receive([
      { type: "image", payload: { url: META_CDN_URL } },
    ])

    expect(mocks.storeIncomingImage).toHaveBeenCalledWith(
      expect.objectContaining({
        uploader,
        profile: "media",
        acl: "public-read",
        key: expect.stringMatching(CHANNEL_MEDIA_KEY),
      }),
    )
    expect(result?.message?.attachments).toEqual([
      expect.objectContaining({
        fileType: "image",
        mimeType: "image/jpeg",
        size: 4000,
        width: 640,
        height: 480,
        isPhotoMessage: true,
        optimized: true,
      }),
    ])
  })

  test("a file attachment keeps its original bytes", async () => {
    serve("application/pdf")
    mocks.storeIncomingImage.mockResolvedValue(
      stored({
        mimeType: "application/pdf",
        optimized: false,
        skipped: "mime",
        width: undefined,
        height: undefined,
      }),
    )

    const result = await receive([
      { type: "file", payload: { url: META_CDN_URL } },
    ])

    expect(mocks.storeIncomingImage).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "original" }),
    )
    expect(result?.message?.attachments?.[0]?.optimized).toBeFalsy()
  })

  test("an image that was not encoded is left for the background job", async () => {
    serve("image/jpeg")
    mocks.storeIncomingImage.mockResolvedValue(
      stored({ optimized: false, skipped: "bytes", size: 3_000_000 }),
    )

    const result = await receive([
      { type: "image", payload: { url: META_CDN_URL } },
    ])

    expect(result?.message?.attachments?.[0]).toMatchObject({
      isPhotoMessage: true,
      size: 3_000_000,
    })
    expect(result?.message?.attachments?.[0]?.optimized).toBeFalsy()
  })
})
