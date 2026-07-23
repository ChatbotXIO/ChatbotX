import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { getInstagramAccount } from "../src/apis/auth"
import { INSTAGRAM_API_URL } from "../src/constants"

const ACCESS_TOKEN = "instagram-user-access-token"

function mockMeResponse(accountType: string | undefined) {
  server.use(
    http.get(`${INSTAGRAM_API_URL}/me`, ({ request }) => {
      expect(new URL(request.url).searchParams.get("access_token")).toBe(
        ACCESS_TOKEN,
      )
      return HttpResponse.json({
        id: "ig-account-id",
        user_id: "ig-user-id",
        username: "fenny.studio",
        name: "Fenny Studio",
        profile_picture_url: "https://example.test/avatar.jpg",
        ...(accountType === undefined ? {} : { account_type: accountType }),
      })
    }),
  )
}

describe("getInstagramAccount", () => {
  test.each([
    "BUSINESS",
    "CREATOR",
    "MEDIA_CREATOR",
  ])("returns the account when account_type is %s", async (accountType) => {
    mockMeResponse(accountType)

    await expect(getInstagramAccount(ACCESS_TOKEN)).resolves.toEqual(
      expect.objectContaining({
        id: "ig-account-id",
        username: "fenny.studio",
        userId: "ig-user-id",
        accessToken: ACCESS_TOKEN,
      }),
    )
  })

  test.each([
    "PERSONAL",
    "UNKNOWN_TYPE",
    undefined,
  ])("returns null when account_type is %s", async (accountType) => {
    mockMeResponse(accountType)

    await expect(getInstagramAccount(ACCESS_TOKEN)).resolves.toBeNull()
  })
})
