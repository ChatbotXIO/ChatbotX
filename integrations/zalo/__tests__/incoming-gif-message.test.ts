import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test, vi } from "vitest"
import { receiveMessage } from "../src/handlers/message/incoming-message"

const GIF_URL = "https://zgif-v2.zdn.vn/833031e40aa1e3ffbab0.gif"

// Captured from production — Zalo does not document `user_send_gif`.
const USER_SEND_GIF_EVENT = {
  event_name: "user_send_gif",
  app_id: "960762598645803452",
  sender: { id: "3234151001898787112" },
  recipient: { id: "4598245833493169062" },
  message: {
    attachments: [
      {
        payload: {
          thumbnail: "https://zgif-v2.zdn.vn/8dd43c000745ee1bb754.png",
          url: GIF_URL,
        },
        type: "gif",
      },
    ],
    msg_id: "0309b0c58bb4ecedb5a2",
  },
  timestamp: "1790413469192",
}

function buildCtx() {
  return {
    storagePrefix: "workspace-1",
    uploader: { putObject: vi.fn(async () => undefined) },
    auth: { tokens: { accessToken: "oa-token" } },
  } as never
}

const receive = (payload: Record<string, unknown>) =>
  receiveMessage({
    ctx: buildCtx(),
    data: {
      integrationType: "zalo",
      integrationIdentifier: "4598245833493169062",
      payload,
    },
  } as never)

describe("zalo incoming GIF messages", () => {
  test("keeps a text-less user_send_gif message with the GIF attached", async () => {
    server.use(
      http.get(
        GIF_URL,
        () =>
          new HttpResponse(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/gif" },
          }),
      ),
    )

    const result = await receive(USER_SEND_GIF_EVENT)

    expect(result?.contact.sourceId).toBe("3234151001898787112")
    expect(result?.message.attachments).toEqual([
      expect.objectContaining({ fileType: "image", mimeType: "image/gif" }),
    ])
  })

  test("drops the message only when the GIF download fails and there is no text", async () => {
    server.use(
      http.get(GIF_URL, () => HttpResponse.text("gone", { status: 404 })),
    )

    await expect(receive(USER_SEND_GIF_EVENT)).rejects.toThrow(
      "No content found in message user_send_gif",
    )
  })
})
