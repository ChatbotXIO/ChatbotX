import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { listInstagramMedia } from "../src/apis/post"
import { API_URL, DEFAULT_API_VERSION } from "../src/constants"
import type { InstagramAuthValue } from "../src/schemas"

const ACCESS_TOKEN = "IG_TOKEN"
const IG_ID = "ig-business-account-id"

const auth = {
  tokens: { accessToken: ACCESS_TOKEN },
  metadata: { igId: IG_ID, version: DEFAULT_API_VERSION },
} as unknown as InstagramAuthValue

describe("listInstagramMedia", () => {
  test("addresses the account directly via igId, not the me alias", async () => {
    server.use(
      http.get(
        `${API_URL}/${DEFAULT_API_VERSION}/${IG_ID}/media`,
        ({ request }) => {
          expect(request.headers.get("authorization")).toBe(
            `Bearer ${ACCESS_TOKEN}`,
          )
          expect(new URL(request.url).searchParams.get("fields")).toContain(
            "media_product_type",
          )
          return HttpResponse.json({
            data: [
              {
                id: "post-media-id",
                timestamp: "2026-07-16T00:00:00Z",
                media_product_type: "FEED",
              },
              {
                id: "reel-media-id",
                timestamp: "2026-07-16T01:00:00Z",
                media_product_type: "REELS",
              },
            ],
          })
        },
      ),
    )

    await expect(listInstagramMedia({ auth })).resolves.toEqual([
      expect.objectContaining({ id: "post-media-id" }),
      expect.objectContaining({ id: "reel-media-id" }),
    ])
  })
})
