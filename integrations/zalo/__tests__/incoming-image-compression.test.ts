import type { Context } from "@chatbotx.io/sdk"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ storeIncomingImage: vi.fn() }))

vi.mock("@chatbotx.io/utils/store-incoming-image", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@chatbotx.io/utils/store-incoming-image")
  >()),
  storeIncomingImage: mocks.storeIncomingImage,
}))

const { getMessageAttachmentEntity } = await import("../src/api/message")
const { fetchAndReuploadImage } = await import("../src/lib/image")

const IMAGE_URL = "https://zimg.example.vn/photo.jpg"
const MEDIA_KEY = /^public\/zalo\/ws-1\/int-1\/2026\/10\/06\//
const AVATAR_KEY = /^workspace-1\//
const uploader = { putObject: vi.fn() }

const ctx = {
  storagePrefix: "workspace-1",
  mediaStoragePrefix: "public/zalo/ws-1/int-1/2026/10/06",
  uploader,
  auth: { tokens: { accessToken: "oa-token" } },
} as unknown as Context<never>

const serveImage = (contentType = "image/jpeg") =>
  server.use(
    http.get(
      IMAGE_URL,
      () =>
        new HttpResponse(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": contentType },
        }),
    ),
  )

const stored = (overrides: Record<string, unknown> = {}) => ({
  originPath: "ignored",
  mimeType: "image/jpeg",
  size: 5000,
  width: 800,
  height: 600,
  optimized: true,
  ...overrides,
})

describe("zalo attachment — inline compression", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serveImage()
  })

  test("an image goes through the inline encoder with the media profile", async () => {
    mocks.storeIncomingImage.mockResolvedValue(stored())

    const attachment = await getMessageAttachmentEntity({
      ctx,
      attachment: { type: "image", payload: { url: IMAGE_URL } } as never,
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
    expect(attachment).toMatchObject({
      fileType: "image",
      mimeType: "image/jpeg",
      size: 5000,
      width: 800,
      height: 600,
      isPhotoMessage: true,
      optimized: true,
    })
  })

  test("a file attachment keeps its original bytes", async () => {
    serveImage("application/pdf")
    mocks.storeIncomingImage.mockResolvedValue(
      stored({
        mimeType: "application/pdf",
        optimized: false,
        skipped: "mime",
      }),
    )

    const attachment = await getMessageAttachmentEntity({
      ctx,
      attachment: { type: "file", payload: { url: IMAGE_URL } } as never,
    })

    expect(mocks.storeIncomingImage).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "original" }),
    )
    expect(attachment?.optimized).toBeFalsy()
  })

  test("an image that was not encoded is left for the background job", async () => {
    mocks.storeIncomingImage.mockResolvedValue(
      stored({ optimized: false, skipped: "bytes", size: 3_000_000 }),
    )

    const attachment = await getMessageAttachmentEntity({
      ctx,
      attachment: { type: "image", payload: { url: IMAGE_URL } } as never,
    })

    expect(attachment).toMatchObject({ isPhotoMessage: true, size: 3_000_000 })
    expect(attachment?.optimized).toBeFalsy()
  })
})

describe("zalo avatar — inline compression", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serveImage()
  })

  test("stores the avatar through the encoder with the avatar profile", async () => {
    mocks.storeIncomingImage.mockImplementation(
      async ({ key }: { key: string }) =>
        stored({ originPath: key, mimeType: "image/webp" }),
    )

    const path = await fetchAndReuploadImage({ ctx, avatarUrl: IMAGE_URL })

    expect(mocks.storeIncomingImage).toHaveBeenCalledWith(
      expect.objectContaining({
        uploader,
        profile: "avatar",
        acl: "public-read",
        key: expect.stringMatching(AVATAR_KEY),
      }),
    )
    expect(path).toMatch(AVATAR_KEY)
  })

  test("returns nothing when the avatar cannot be downloaded", async () => {
    server.use(
      http.get(IMAGE_URL, () => HttpResponse.text("no", { status: 404 })),
    )

    await expect(
      fetchAndReuploadImage({ ctx, avatarUrl: IMAGE_URL }),
    ).resolves.toBeUndefined()
    expect(mocks.storeIncomingImage).not.toHaveBeenCalled()
  })
})
