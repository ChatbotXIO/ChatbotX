import type { Context } from "@chatbotx.io/sdk"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { getUserProfile } from "../src/api/user"
import type { ZaloAuthValue } from "../src/schema/definition"

const ACCESS_TOKEN = "ZALO_TOKEN"
const BASE = "https://openapi.zalo.me"

const ctx = {
  auth: { tokens: { accessToken: ACCESS_TOKEN } },
} as unknown as Context<ZaloAuthValue>

const mockUserProfile = (data: Record<string, unknown>) => {
  server.use(
    http.get(`${BASE}/v3.0/oa/user/detail`, ({ request }) => {
      expect(request.headers.get("access_token")).toBe(ACCESS_TOKEN)
      return HttpResponse.json({
        error: 0,
        message: "Success",
        data: {
          user_id: "U123",
          display_name: "Ada",
          avatar: "",
          ...data,
        },
      })
    }),
  )
}

describe("getUserProfile", () => {
  test.each([
    [1, "male"],
    ["1", "male"],
    [2, "female"],
    ["2", "female"],
    [0, undefined],
    [3, undefined],
    [undefined, undefined],
  ])("normalizes user_gender %s", async (userGender, expected) => {
    mockUserProfile({ user_gender: userGender })

    await expect(getUserProfile({ ctx, psid: "U123" })).resolves.toMatchObject({
      sourceId: "U123",
      firstName: "Ada",
      gender: expected,
    })
  })
})
