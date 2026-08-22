import type { Oauth2Config } from "@chatbotx.io/sdk"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { refreshAccessToken } from "../src/api/auth"

const TOKEN_URL = "https://oauth.zaloapp.com/v4/oa/access_token"

const setting = {
  clientId: "app-1",
  clientSecret: "secret-1",
  redirectUrl: "https://app.example.com/integrations/zalo/callback",
} as Oauth2Config

const mockTokenEndpoint = (body: Record<string, unknown>, status = 200) => {
  server.use(
    http.post(TOKEN_URL, async ({ request }) => {
      expect(request.headers.get("secret_key")).toBe("secret-1")
      const params = new URLSearchParams(await request.text())
      expect(params.get("grant_type")).toBe("refresh_token")
      expect(params.get("refresh_token")).toBe("refresh-1")
      expect(params.get("app_id")).toBe("app-1")
      return HttpResponse.json(body, { status })
    }),
  )
}

describe("refreshAccessToken", () => {
  test("returns the rotated tokens on success", async () => {
    mockTokenEndpoint({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: "90000",
    })

    await expect(refreshAccessToken(setting, "refresh-1")).resolves.toEqual({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: "90000",
    })
  })

  test("rejects with the OAuth error description when Zalo returns an error_name body with HTTP 200", async () => {
    mockTokenEndpoint({
      error_name: "invalid_grant",
      error_reason: "refresh token invalid",
      error_description: "Refresh token is invalid or expired",
    })

    await expect(refreshAccessToken(setting, "refresh-1")).rejects.toThrow(
      "Refresh token is invalid or expired",
    )
  })

  test("rejects with a meaningful message when the error body has a numeric error but no message", async () => {
    mockTokenEndpoint({
      error: -14_020,
      error_name: "invalid_grant",
    })

    await expect(refreshAccessToken(setting, "refresh-1")).rejects.toThrow(
      "invalid_grant",
    )
  })

  test("rejects instead of returning token-less success bodies", async () => {
    mockTokenEndpoint({ unexpected: "shape" })

    await expect(refreshAccessToken(setting, "refresh-1")).rejects.toThrow(
      "Refresh access token failed",
    )
  })

  test("rejects on non-200 responses", async () => {
    mockTokenEndpoint({ error_name: "invalid_request" }, 400)

    await expect(refreshAccessToken(setting, "refresh-1")).rejects.toThrow()
  })
})
