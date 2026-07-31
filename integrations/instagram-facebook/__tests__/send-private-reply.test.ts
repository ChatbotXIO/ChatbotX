import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { sendPrivateReply } from "../src/apis/comment"
import { API_URL, DEFAULT_API_VERSION } from "../src/constants"
import type { InstagramAuthValue } from "../src/schemas"

const ACCESS_TOKEN = "IG_TOKEN"
const IG_ID = "ig-business-account-id"
const COMMENT_ID = "comment-123"

const auth = {
  tokens: { accessToken: ACCESS_TOKEN },
  metadata: { igId: IG_ID, version: DEFAULT_API_VERSION },
} as unknown as InstagramAuthValue

describe("sendPrivateReply", () => {
  test("addresses the account directly via igId, not the me alias", async () => {
    server.use(
      http.post(
        `${API_URL}/${DEFAULT_API_VERSION}/${IG_ID}/messages`,
        async ({ request }) => {
          expect(request.headers.get("authorization")).toBe(
            `Bearer ${ACCESS_TOKEN}`,
          )
          await expect(request.json()).resolves.toEqual({
            recipient: { comment_id: COMMENT_ID },
            message: { text: "Hello from Instagram via Facebook" },
          })
          return HttpResponse.json({ recipient_id: "recipient-1" })
        },
      ),
    )

    await expect(
      sendPrivateReply(auth, COMMENT_ID, "Hello from Instagram via Facebook"),
    ).resolves.toEqual({ recipient_id: "recipient-1" })
  })
})
