import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { sendPrivateReply, sendPrivateReplyMessage } from "../src/apis/comment"
import { DEFAULT_API_VERSION } from "../src/constants"
import {
  MESSENGER_MESSAGE_METADATA,
  type MessengerAuthValue,
} from "../src/schema"

const PAGE_ID = "page-1"
const COMMENT_ID = "comment-123"
const BASE = "https://graph.facebook.com"

const auth = {
  tokens: { accessToken: "PAGE_TOKEN" },
  metadata: { pageId: PAGE_ID },
} as unknown as MessengerAuthValue

function captureRequestBody(): { body: () => unknown } {
  let body: unknown = null
  server.use(
    http.post(
      `${BASE}/${DEFAULT_API_VERSION}/${PAGE_ID}/messages`,
      async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({
          recipient_id: "psid-1",
          message_id: "m_1",
        })
      },
    ),
  )
  return { body: () => body }
}

describe("sendPrivateReply", () => {
  test("stamps message.metadata so the message_echo webhook recognizes and skips it", async () => {
    const captured = captureRequestBody()

    await sendPrivateReply(auth, COMMENT_ID, "hello")

    expect(captured.body()).toEqual({
      recipient: { comment_id: COMMENT_ID },
      message: { text: "hello", metadata: MESSENGER_MESSAGE_METADATA },
      persona_id: undefined,
    })
  })
})

describe("sendPrivateReplyMessage", () => {
  test("posts an arbitrary message payload with recipient.comment_id, stamped metadata, and persona_id", async () => {
    const captured = captureRequestBody()

    await sendPrivateReplyMessage(
      auth,
      COMMENT_ID,
      {
        attachment: { type: "image", payload: { url: "https://x.com/a.jpg" } },
      },
      "persona-1",
    )

    expect(captured.body()).toEqual({
      recipient: { comment_id: COMMENT_ID },
      message: {
        attachment: { type: "image", payload: { url: "https://x.com/a.jpg" } },
        metadata: MESSENGER_MESSAGE_METADATA,
      },
      persona_id: "persona-1",
    })
  })

  test("omits persona_id when not provided", async () => {
    const captured = captureRequestBody()

    await sendPrivateReplyMessage(auth, COMMENT_ID, { text: "hi" })

    expect(captured.body()).not.toHaveProperty("persona_id")
  })
})
