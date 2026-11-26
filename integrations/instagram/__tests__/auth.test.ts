import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import {
  exchangeCodeForToken,
  fetchInstagramAccount,
  getInstagramAccount,
} from "../src/apis/auth"
import { API_URL, INSTAGRAM_OAUTH_URL } from "../src/constants"
import { isRevokedTokenError } from "../src/lib/error-mapper"

const ACCESS_TOKEN = "instagram-user-access-token"

function mockMeResponse(accountType: string | undefined) {
  server.use(
    http.get(`${API_URL}/me`, ({ request }) => {
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

  test("returns null for a revoked token in a legacy connect flow", async () => {
    server.use(
      http.get(`${API_URL}/me`, () =>
        HttpResponse.json(
          {
            error: {
              code: 190,
              error_subcode: 463,
              message: "Error validating access token: Session has expired.",
              type: "OAuthException",
            },
          },
          { status: 400 },
        ),
      ),
    )

    await expect(getInstagramAccount(ACCESS_TOKEN)).resolves.toBeNull()
  })

  test("preserves revoked-token API errors for connection verification", async () => {
    server.use(
      http.get(`${API_URL}/me`, () =>
        HttpResponse.json(
          {
            error: {
              code: 190,
              error_subcode: 463,
              message: "Error validating access token: Session has expired.",
              type: "OAuthException",
            },
          },
          { status: 400 },
        ),
      ),
    )

    await expect(fetchInstagramAccount(ACCESS_TOKEN)).rejects.toSatisfy(
      isRevokedTokenError,
    )
  })
})

describe("exchangeCodeForToken permissions", () => {
  const settings = { clientId: "id", clientSecret: "secret" }

  const mockExchange = (body: unknown) =>
    server.use(
      http.post(`${INSTAGRAM_OAUTH_URL}/oauth/access_token`, () =>
        HttpResponse.json(body),
      ),
      http.get(`${API_URL}/access_token`, () =>
        HttpResponse.json({ access_token: "long", expires_in: 1 }),
      ),
    )

  test.each([
    [
      "documented data shape, comma string",
      {
        data: [
          {
            access_token: "short",
            permissions:
              "instagram_business_basic, instagram_business_content_publish",
            user_id: 7,
          },
        ],
      },
      ["instagram_business_basic", "instagram_business_content_publish"],
    ],
    [
      "flat shape, array",
      {
        access_token: "short",
        permissions: ["instagram_business_basic"],
        user_id: "7",
      },
      ["instagram_business_basic"],
    ],
    ["no permissions", { access_token: "short", user_id: "7" }, null],
  ])("%s", async (_name, body, expected) => {
    mockExchange(body)
    const result = await exchangeCodeForToken(settings, "code", "https://r")
    expect(result).toEqual({
      accessToken: "long",
      grantedScopes: expected,
      userId: "7",
    })
  })
})
