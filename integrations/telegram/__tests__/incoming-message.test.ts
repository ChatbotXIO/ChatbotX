import { afterEach, describe, expect, test, vi } from "vitest"
import { getTelegramFileUrl } from "../src/apis/bot"
import { receiveMessage } from "../src/handlers/message/incoming-message"

vi.mock("../src/apis/bot", () => ({
  getTelegramFileUrl: vi.fn(),
}))

const ctx = {
  auth: {
    secretText: "telegram-token",
  },
} as never

const photoMessagePayload = (
  photo: Array<{
    file_id: string
    file_unique_id: string
    width: number
    height: number
    file_size: number
  }>,
) => ({
  update_id: 1,
  message: {
    message_id: 10,
    from: {
      id: 100,
      is_bot: false,
      first_name: "Ada",
    },
    chat: {
      id: 100,
      type: "private",
    },
    date: 1_765_440_000,
    photo,
  },
})

const samplePhoto = [
  {
    file_id: "small",
    file_unique_id: "small-unique",
    width: 90,
    height: 90,
    file_size: 2366,
  },
  {
    file_id: "largest",
    file_unique_id: "largest-unique",
    width: 700,
    height: 700,
    file_size: 51_569,
  },
]

const buildCtx = () => ({
  auth: { secretText: "telegram-token" },
  storagePrefix: "workspace-1",
  uploader: { putObject: vi.fn().mockResolvedValue(undefined) },
})

describe("receiveMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.mocked(getTelegramFileUrl).mockReset()
  })

  test("stores locale from message sender language_code", async () => {
    const result = await receiveMessage({
      ctx,
      data: {
        integrationType: "telegram",
        integrationIdentifier: "bot-1",
        payload: {
          update_id: 1,
          message: {
            message_id: 10,
            from: {
              id: 100,
              is_bot: false,
              first_name: "Ada",
              last_name: "Lovelace",
              language_code: "vi",
            },
            chat: {
              id: 100,
              type: "private",
            },
            date: 1_765_440_000,
            text: "hello",
          },
        },
      },
    })

    expect(result.contact.locale).toBe("vi")
  })

  test("stores locale from callback query sender language_code", async () => {
    const result = await receiveMessage({
      ctx,
      data: {
        integrationType: "telegram",
        integrationIdentifier: "bot-1",
        payload: {
          update_id: 1,
          callback_query: {
            id: "callback-1",
            from: {
              id: 100,
              is_bot: false,
              first_name: "Ada",
              language_code: "vi",
            },
            data: "button-1",
          },
        },
      },
    })

    expect(result.contact.locale).toBe("vi")
  })

  test("leaves locale undefined when message sender is absent", async () => {
    const result = await receiveMessage({
      ctx,
      data: {
        integrationType: "telegram",
        integrationIdentifier: "bot-1",
        payload: {
          update_id: 1,
          message: {
            message_id: 10,
            chat: {
              id: 100,
              type: "private",
            },
            date: 1_765_440_000,
            text: "hello",
          },
        },
      },
    })

    expect(result.contact.locale).toBeUndefined()
  })

  test("attaches the largest photo with its width/height", async () => {
    vi.mocked(getTelegramFileUrl).mockResolvedValue(
      "https://api.telegram.org/file/bot-token/photo.jpg",
    )
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      ),
    )

    const testCtx = buildCtx()
    const result = await receiveMessage({
      ctx: testCtx as never,
      data: {
        integrationType: "telegram",
        integrationIdentifier: "bot-1",
        payload: photoMessagePayload(samplePhoto),
      },
    })

    expect(result.message?.attachments).toEqual([
      expect.objectContaining({
        fileType: "image",
        mimeType: "image/jpeg",
        width: 700,
        height: 700,
      }),
    ])
    expect(testCtx.uploader.putObject).toHaveBeenCalledTimes(1)
  })

  test("rejects instead of silently dropping the attachment when the download fails", async () => {
    vi.mocked(getTelegramFileUrl).mockResolvedValue(
      "https://api.telegram.org/file/bot-token/photo.jpg",
    )
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 500,
          statusText: "Internal Server Error",
        }),
      ),
    )

    const testCtx = buildCtx()

    await expect(
      receiveMessage({
        ctx: testCtx as never,
        data: {
          integrationType: "telegram",
          integrationIdentifier: "bot-1",
          payload: photoMessagePayload(samplePhoto),
        },
      }),
    ).rejects.toThrow()
    expect(testCtx.uploader.putObject).not.toHaveBeenCalled()
  })

  describe("animations and stickers", () => {
    const mediaMessagePayload = (media: Record<string, unknown>) => ({
      update_id: 1,
      message: {
        message_id: 11,
        from: { id: 100, is_bot: false, first_name: "Ada" },
        chat: { id: 100, type: "private" },
        date: 1_765_440_000,
        ...media,
      },
    })

    const receiveMedia = (
      testCtx: ReturnType<typeof buildCtx>,
      media: Record<string, unknown>,
    ) =>
      receiveMessage({
        ctx: testCtx as never,
        data: {
          integrationType: "telegram",
          integrationIdentifier: "bot-1",
          payload: mediaMessagePayload(media),
        },
      })

    const stubDownload = () => {
      vi.mocked(getTelegramFileUrl).mockImplementation(
        async (_auth, fileId) => `https://api.telegram.org/file/bot/${fileId}`,
      )
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockImplementation(
            async () =>
              new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
          ),
      )
    }

    test("stores an animation once as a gif, ignoring the duplicate document", async () => {
      stubDownload()
      const testCtx = buildCtx()
      const gifFile = {
        file_id: "gif-file",
        file_unique_id: "gif-unique",
        mime_type: "video/mp4",
      }

      const result = await receiveMedia(testCtx, {
        animation: gifFile,
        document: gifFile,
      })

      expect(result.message?.attachments).toEqual([
        expect.objectContaining({ fileType: "gif", mimeType: "video/mp4" }),
      ])
      expect(getTelegramFileUrl).toHaveBeenCalledTimes(1)
      expect(testCtx.uploader.putObject).toHaveBeenCalledTimes(1)
    })

    test("stores a static sticker as a webp image with its size", async () => {
      stubDownload()

      const result = await receiveMedia(buildCtx(), {
        sticker: {
          file_id: "sticker-file",
          file_unique_id: "sticker-unique",
          width: 512,
          height: 512,
          is_animated: false,
          is_video: false,
        },
      })

      expect(result.message?.attachments).toEqual([
        expect.objectContaining({
          fileType: "image",
          mimeType: "image/webp",
          width: 512,
          height: 512,
        }),
      ])
    })

    test("stores a video sticker as a looping gif", async () => {
      stubDownload()

      const result = await receiveMedia(buildCtx(), {
        sticker: {
          file_id: "video-sticker",
          file_unique_id: "video-sticker-unique",
          width: 512,
          height: 512,
          is_animated: false,
          is_video: true,
        },
      })

      expect(result.message?.attachments).toEqual([
        expect.objectContaining({ fileType: "gif", mimeType: "video/webm" }),
      ])
    })

    test("stores the thumbnail of an animated .tgs sticker", async () => {
      stubDownload()

      const result = await receiveMedia(buildCtx(), {
        sticker: {
          file_id: "tgs-sticker",
          file_unique_id: "tgs-unique",
          width: 512,
          height: 512,
          is_animated: true,
          is_video: false,
          thumbnail: {
            file_id: "tgs-thumb",
            file_unique_id: "tgs-thumb-unique",
            width: 128,
            height: 128,
          },
        },
      })

      expect(getTelegramFileUrl).toHaveBeenCalledWith(
        expect.anything(),
        "tgs-thumb",
      )
      expect(result.message?.attachments).toEqual([
        expect.objectContaining({
          fileType: "image",
          mimeType: "image/webp",
          width: 128,
        }),
      ])
    })

    test("skips an animated .tgs sticker without a thumbnail", async () => {
      stubDownload()

      const result = await receiveMedia(buildCtx(), {
        sticker: {
          file_id: "tgs-sticker",
          file_unique_id: "tgs-unique",
          width: 512,
          height: 512,
          is_animated: true,
          is_video: false,
        },
      })

      expect(result.message?.attachments).toEqual([])
      expect(getTelegramFileUrl).not.toHaveBeenCalled()
    })
  })
})
