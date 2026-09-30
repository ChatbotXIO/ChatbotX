import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { listThreadsPosts } from "../src/apis/post"
import { API_URL } from "../src/constants"
import type { ThreadsAuthValue } from "../src/schema"

const auth = {
  tokens: { accessToken: "threads-token" },
  metadata: {
    threadsUserId: "threads-user-1",
    username: "chatbotx",
    version: "v1.0",
  },
} as ThreadsAuthValue

describe("listThreadsPosts", () => {
  test("requests the account's posts and drops reposts", async () => {
    server.use(
      http.get(`${API_URL}/v1.0/me/threads`, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get("fields")).toBe(
          "id,text,media_type,media_url,thumbnail_url,permalink,timestamp",
        )
        expect(url.searchParams.get("limit")).toBe("100")
        expect(url.searchParams.get("access_token")).toBe("threads-token")
        return HttpResponse.json({
          data: [
            {
              id: "17841400000000001",
              text: "Hello",
              media_type: "TEXT_POST",
              timestamp: "2026-09-01T08:00:00+0000",
            },
            {
              id: "17841400000000002",
              media_type: "REPOST_FACADE",
              timestamp: "2026-09-02T08:00:00+0000",
            },
          ],
        })
      }),
    )

    await expect(listThreadsPosts({ auth })).resolves.toEqual([
      {
        id: "17841400000000001",
        text: "Hello",
        media_type: "TEXT_POST",
        timestamp: "2026-09-01T08:00:00+0000",
      },
    ])
  })
})
