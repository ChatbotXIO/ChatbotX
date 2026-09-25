import {
  DEFAULT_MEDIA_DOWNLOAD_MAX_BYTES,
  DEFAULT_MEDIA_DOWNLOAD_TIMEOUT_MS,
} from "@chatbotx.io/utils/media-download"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { beforeEach, describe, expect, test, vi } from "vitest"

import { getMessageAttachmentEntity } from "../src/apis/attachment"
import { getCommentAttachment } from "../src/apis/comment"
import {
  downloadAttachments,
  receiveMessage,
} from "../src/handlers/message/incomming-message"
import type { MessengerWebhookEvent } from "../src/schema"

const AUTH = {
  clientId: "app-123",
  tokens: { accessToken: "page-token" },
  metadata: {
    pageId: "page-123",
    version: "v23.0",
  },
} as never

function buildCtx() {
  return {
    storagePrefix: "workspace-1",
    uploader: { putObject: vi.fn(async () => undefined) },
    auth: AUTH,
  } as never
}

function buildWebhookPayload(
  attachmentUrl: string,
): { object: "page" } & Pick<MessengerWebhookEvent, "entry"> {
  return buildWebhookPayloadWithAttachmentUrls([attachmentUrl])
}

function buildWebhookPayloadWithAttachmentUrls(
  attachmentUrls: string[],
): { object: "page" } & Pick<MessengerWebhookEvent, "entry"> {
  return {
    object: "page",
    entry: [
      {
        id: "page-123",
        time: 1_700_000_000,
        messaging: [
          {
            sender: { id: "user-1" },
            recipient: { id: "page-123" },
            timestamp: 1_700_000_000,
            message: {
              mid: "mid-1",
              attachments: attachmentUrls.map((url) => ({
                type: "image",
                payload: { url },
              })),
            },
          },
        ],
      },
    ],
  } as never
}

describe("messenger incoming sticker/image attachments", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  test("uses the legacy raw download path and content-length size when bounds are omitted", async () => {
    server.use(
      http.get(
        "https://sticker.cdn.test/raw.png",
        () =>
          new HttpResponse(new Uint8Array([1, 2, 3, 4]), {
            headers: {
              "content-length": "99",
              "content-type": "image/png",
            },
            status: 200,
          }),
      ),
    )

    const attachment = await getMessageAttachmentEntity({
      ctx: buildCtx(),
      attachment: {
        type: "image",
        payload: { url: "https://sticker.cdn.test/raw.png" },
      },
    })

    expect(attachment?.size).toBe(99)
  })

  test("throws the legacy error for a non-OK raw download", async () => {
    server.use(
      http.get("https://sticker.cdn.test/forbidden.png", () =>
        HttpResponse.text("forbidden", { status: 403 }),
      ),
    )

    await expect(
      getMessageAttachmentEntity({
        ctx: buildCtx(),
        attachment: {
          type: "image",
          payload: { url: "https://sticker.cdn.test/forbidden.png" },
        },
      }),
    ).rejects.toThrow(
      "Failed to download attachment (status 403 Forbidden): https://sticker.cdn.test/forbidden.png",
    )
  })

  test("uses the bounded downloader only when download limits are provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3, 4]), {
        headers: { "content-type": "image/png" },
        status: 200,
      }),
    )

    const result = await getMessageAttachmentEntity({
      ctx: buildCtx(),
      attachment: {
        type: "image",
        payload: { url: "https://sticker.cdn.test/bounded.png" },
      },
      download: {
        timeoutMs: DEFAULT_MEDIA_DOWNLOAD_TIMEOUT_MS,
        maxBytes: DEFAULT_MEDIA_DOWNLOAD_MAX_BYTES,
      },
    })

    expect(result).toEqual(expect.objectContaining({ size: 4 }))
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://sticker.cdn.test/bounded.png",
      expect.objectContaining({
        headers: {
          Authorization: "Bearer page-token",
          "User-Agent": "node",
        },
        signal: expect.any(AbortSignal),
      }),
    )
  })

  test("returns no attachment without throwing when the bounded downloader returns null", async () => {
    const ctx = buildCtx()
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("forbidden", { status: 403 }),
    )

    await expect(
      getMessageAttachmentEntity({
        ctx,
        attachment: {
          type: "image",
          payload: { url: "https://sticker.cdn.test/unsupported.png" },
        },
        download: {
          timeoutMs: DEFAULT_MEDIA_DOWNLOAD_TIMEOUT_MS,
          maxBytes: DEFAULT_MEDIA_DOWNLOAD_MAX_BYTES,
        },
      }),
    ).resolves.toBeUndefined()

    expect(ctx.uploader.putObject).not.toHaveBeenCalled()
  })

  test("drops the message's attachment instead of producing a malformed entry when the CDN download fails", async () => {
    server.use(
      http.get("https://sticker.cdn.test/broken.png", () =>
        HttpResponse.text("forbidden", { status: 403 }),
      ),
    )

    const result = await receiveMessage({
      ctx: buildCtx(),
      data: {
        integrationType: "messenger",
        integrationIdentifier: "page-123",
        payload: buildWebhookPayload("https://sticker.cdn.test/broken.png"),
      },
    } as never)

    expect(result?.message?.attachments).toEqual([])
  })

  test("keeps comment attachment downloads on the raw path", async () => {
    server.use(
      http.get("https://graph.facebook.com/v23.0/comment-1", () =>
        HttpResponse.json({
          attachment: {
            type: "photo",
            media: {
              image: { src: "https://sticker.cdn.test/comment.png" },
            },
          },
        }),
      ),
      http.get("https://sticker.cdn.test/comment.png", () =>
        HttpResponse.text("forbidden", { status: 403 }),
      ),
    )

    await expect(
      getCommentAttachment({
        ctx: buildCtx(),
        input: { commentId: "comment-1" },
      }),
    ).resolves.toEqual({ type: "photo", attachment: undefined })
  })

  test("keeps the sticker as an image attachment even when its dimensions can't be parsed", async () => {
    server.use(
      http.get(
        "https://sticker.cdn.test/sticker.webp",
        () =>
          new HttpResponse(new Uint8Array([1, 2, 3, 4]), {
            headers: { "content-type": "image/webp" },
            status: 200,
          }),
      ),
    )

    const result = await receiveMessage({
      ctx: buildCtx(),
      data: {
        integrationType: "messenger",
        integrationIdentifier: "page-123",
        payload: buildWebhookPayload("https://sticker.cdn.test/sticker.webp"),
      },
    } as never)

    const [attachment] = result?.message?.attachments ?? []
    expect(attachment).toEqual(
      expect.objectContaining({
        fileType: "image",
        mimeType: "image/webp",
      }),
    )
    expect(attachment).not.toHaveProperty("width")
    expect(attachment).not.toHaveProperty("height")
  })

  test("dedupes attachments sharing the same url instead of storing the sticker twice", async () => {
    let downloadCount = 0
    server.use(
      http.get("https://sticker.cdn.test/duplicate.png", () => {
        downloadCount++
        return new HttpResponse(new Uint8Array([1, 2, 3, 4]), {
          headers: { "content-type": "image/png" },
          status: 200,
        })
      }),
    )

    const result = await receiveMessage({
      ctx: buildCtx(),
      data: {
        integrationType: "messenger",
        integrationIdentifier: "page-123",
        payload: buildWebhookPayloadWithAttachmentUrls([
          "https://sticker.cdn.test/duplicate.png",
          "https://sticker.cdn.test/duplicate.png",
        ]),
      },
    } as never)

    expect(result?.message?.attachments).toHaveLength(1)
    expect(downloadCount).toBe(1)
  })

  test("preserves the descriptor sourceId when downloading a collected echo attachment", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3, 4]), {
        headers: { "content-type": "image/png" },
        status: 200,
      }),
    )

    const result = await downloadAttachments({
      ctx: buildCtx(),
      data: {
        descriptors: [
          {
            sourceId: "mid-1:0",
            type: "image",
            url: "https://sticker.cdn.test/echo.png",
          },
        ],
      },
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://sticker.cdn.test/echo.png",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.sourceId).toBe("mid-1:0")
  })

  test("enforces the default byte cap on collected echo attachments", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(new Uint8Array([1]), {
        headers: {
          "content-length": String(DEFAULT_MEDIA_DOWNLOAD_MAX_BYTES + 1),
          "content-type": "video/mp4",
        },
        status: 200,
      }),
    )

    const result = await downloadAttachments({
      ctx: buildCtx(),
      data: {
        descriptors: [
          {
            sourceId: "mid-large:0",
            type: "video",
            url: "https://sticker.cdn.test/large.mp4",
          },
        ],
      },
    })

    expect(result).toEqual([])
  })

  test("keeps generating fresh sourceIds for existing attachment callers", async () => {
    server.use(
      http.get(
        "https://sticker.cdn.test/current.png",
        () =>
          new HttpResponse(new Uint8Array([1, 2, 3, 4]), {
            headers: { "content-type": "image/png" },
            status: 200,
          }),
      ),
    )
    const props = {
      ctx: buildCtx(),
      attachment: {
        type: "image" as const,
        payload: { url: "https://sticker.cdn.test/current.png" },
      },
    }

    const first = await getMessageAttachmentEntity(props)
    const second = await getMessageAttachmentEntity(props)

    expect(first?.sourceId).toBeTruthy()
    expect(second?.sourceId).toBeTruthy()
    expect(second?.sourceId).not.toBe(first?.sourceId)
  })
})
