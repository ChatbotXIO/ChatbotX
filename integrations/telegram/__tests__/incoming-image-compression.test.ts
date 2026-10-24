import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  storeIncomingImage: vi.fn(),
  getTelegramFileUrl: vi.fn(),
}))

vi.mock("@chatbotx.io/utils/store-incoming-image", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@chatbotx.io/utils/store-incoming-image")
  >()),
  storeIncomingImage: mocks.storeIncomingImage,
}))
vi.mock("../src/apis/bot", () => ({
  getTelegramFileUrl: mocks.getTelegramFileUrl,
}))

const { receiveMessage } = await import(
  "../src/handlers/message/incoming-message"
)

const MEDIA_KEY = /^public\/telegram\/ws-1\/int-1\/2026\/10\/06\//
const uploader = { putObject: vi.fn() }

const receive = async (media: Record<string, unknown>) => {
  const result = await receiveMessage({
    ctx: {
      auth: { secretText: "telegram-token" },
      storagePrefix: "workspace-1",
      mediaStoragePrefix: "public/telegram/ws-1/int-1/2026/10/06",
      uploader,
    } as never,
    data: {
      integrationType: "telegram",
      integrationIdentifier: "bot-1",
      payload: {
        update_id: 1,
        message: {
          message_id: 10,
          from: { id: 100, is_bot: false, first_name: "Ada" },
          chat: { id: 100, type: "private" },
          date: 1_765_440_000,
          ...media,
        },
      },
    },
  })
  return result.message?.attachments
}

const stored = (overrides: Record<string, unknown> = {}) => ({
  originPath: "ignored",
  mimeType: "image/jpeg",
  size: 4000,
  width: 640,
  height: 480,
  optimized: true,
  ...overrides,
})

describe("telegram attachment — inline compression", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getTelegramFileUrl.mockResolvedValue("https://api.telegram.org/f/x")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))),
    )
  })

  test("a photo goes through the inline encoder with the media profile", async () => {
    mocks.storeIncomingImage.mockResolvedValue(stored())

    const attachments = await receive({
      photo: [
        {
          file_id: "p",
          file_unique_id: "pu",
          width: 700,
          height: 700,
          file_size: 51_569,
        },
      ],
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
    expect(attachments).toEqual([
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

  test("keeps the dimensions Telegram reported when the encoder could not read any", async () => {
    mocks.storeIncomingImage.mockResolvedValue(
      stored({
        optimized: false,
        skipped: "undecodable",
        width: undefined,
        height: undefined,
      }),
    )

    const attachments = await receive({
      photo: [
        {
          file_id: "p",
          file_unique_id: "pu",
          width: 700,
          height: 700,
          file_size: 51_569,
        },
      ],
    })

    expect(attachments?.[0]).toMatchObject({ width: 700, height: 700 })
    expect(attachments?.[0]?.optimized).toBeFalsy()
  })

  test("a document keeps its original bytes", async () => {
    mocks.storeIncomingImage.mockResolvedValue(
      stored({
        mimeType: "image/png",
        optimized: false,
        skipped: "profile",
        width: undefined,
        height: undefined,
      }),
    )

    const attachments = await receive({
      document: {
        file_id: "d",
        file_unique_id: "du",
        mime_type: "image/png",
        file_name: "scan.png",
      },
    })

    expect(mocks.storeIncomingImage).toHaveBeenCalledWith(
      expect.objectContaining({ profile: "original" }),
    )
    expect(attachments?.[0]?.isPhotoMessage).toBeUndefined()
    expect(attachments?.[0]?.optimized).toBeFalsy()
  })
})
