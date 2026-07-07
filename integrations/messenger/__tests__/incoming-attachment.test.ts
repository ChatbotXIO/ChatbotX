import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { receiveMessage } from "../src/handlers/message/incomming-message"
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
    vi.clearAllMocks()
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
})
