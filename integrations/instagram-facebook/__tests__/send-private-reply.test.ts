import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { sendPrivateReply } from "../src/apis/comment"
import { API_URL, DEFAULT_API_VERSION } from "../src/constants"
import type { InstagramAuthValue } from "../src/schemas"

const ACCESS_TOKEN = "IG_TOKEN"
const IG_ID = "ig-business-account-id"
const PAGE_ID = "facebook-page-id"
const COMMENT_ID = "comment-123"
const MISSING_PAGE_ID_ERROR = /pageId/

// `pageId` and `igId` are deliberately different values: the old fixture only
// carried `igId`, so it could not tell the two nodes apart and let the #945
// regression (posting to the IG node) look correct.
const auth: InstagramAuthValue = {
  tokens: { accessToken: ACCESS_TOKEN },
  metadata: {
    igId: IG_ID,
    igName: "ig-name",
    pageId: PAGE_ID,
    version: DEFAULT_API_VERSION,
  },
} as InstagramAuthValue

describe("sendPrivateReply", () => {
  test("addresses the Page node, since Meta exposes the messages edge there", async () => {
    server.use(
      http.post(
        `${API_URL}/${DEFAULT_API_VERSION}/${PAGE_ID}/messages`,
        async ({ request }) => {
          expect(request.headers.get("authorization")).toBe(
            `Bearer ${ACCESS_TOKEN}`,
          )
          await expect(request.json()).resolves.toEqual({
            recipient: { comment_id: COMMENT_ID },
            message: {
              text: "Hello from Instagram via Facebook",
              metadata: "SENT_FROM_CHATBOTX",
            },
          })
          return HttpResponse.json({ recipient_id: "recipient-1" })
        },
      ),
    )

    await expect(
      sendPrivateReply(auth, COMMENT_ID, "Hello from Instagram via Facebook"),
    ).resolves.toEqual({ recipient_id: "recipient-1" })
  })

  // Regression guard for #875 → #945: the IG node returns `(#3) Application
  // does not have the capability to make this API call.` for this login type,
  // so a send that reaches it is broken even though the request looks sane.
  test("never posts to the IG node", async () => {
    let igNodeCalled = false

    server.use(
      http.post(`${API_URL}/${DEFAULT_API_VERSION}/${IG_ID}/messages`, () => {
        igNodeCalled = true
        return HttpResponse.json({ recipient_id: "wrong-node" })
      }),
      http.post(`${API_URL}/${DEFAULT_API_VERSION}/${PAGE_ID}/messages`, () =>
        HttpResponse.json({ recipient_id: "recipient-1" }),
      ),
    )

    await sendPrivateReply(auth, COMMENT_ID, "Hello")

    expect(igNodeCalled).toBe(false)
  })

  test("throws instead of posting to /undefined/messages when pageId is missing", async () => {
    const authWithoutPageId = {
      tokens: { accessToken: ACCESS_TOKEN },
      metadata: { igId: IG_ID, version: DEFAULT_API_VERSION },
    } as unknown as InstagramAuthValue

    await expect(
      sendPrivateReply(authWithoutPageId, COMMENT_ID, "Hello"),
    ).rejects.toThrow(MISSING_PAGE_ID_ERROR)
  })
})
