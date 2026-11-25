import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { unsubscribePageFromInstagramWebhook } from "../src/apis/page"
import { DEFAULT_API_VERSION } from "../src/constants"
import { isDisconnectSafeError } from "../src/lib/error-mapper"

const URL = `https://graph.instagram.com/${DEFAULT_API_VERSION}/ig-1/subscribed_apps`

const unsubscribeError = async (
  status: number,
  error: Record<string, unknown>,
): Promise<unknown> => {
  server.use(http.delete(URL, () => HttpResponse.json({ error }, { status })))
  return await unsubscribePageFromInstagramWebhook({
    igId: "ig-1",
    accessToken: "token",
    version: DEFAULT_API_VERSION,
  }).catch((err: unknown) => err)
}

describe("isDisconnectSafeError for an Instagram Login unsubscribe", () => {
  test.each([
    [
      "the app is no longer installed",
      { code: 100, message: "(#100) App is not installed: 123" },
    ],
    [
      "the token was revoked",
      {
        code: 190,
        error_subcode: 458,
        type: "OAuthException",
        message: "Error validating access token",
      },
    ],
  ])("is true when %s", async (_name, error) => {
    expect(isDisconnectSafeError(await unsubscribeError(400, error))).toBe(true)
  })

  test.each([
    [
      "a rate limit",
      400,
      { code: 4, message: "(#4) Application request limit reached" },
    ],
    [
      "a server error",
      500,
      { code: 2, message: "Service temporarily unavailable" },
    ],
    [
      "another invalid parameter",
      400,
      { code: 100, message: "(#100) Invalid parameter" },
    ],
    [
      "a missing object",
      400,
      { code: 100, error_subcode: 33, message: "Unsupported delete request." },
    ],
    [
      "a permissions error",
      400,
      { code: 200, message: "(#200) Permissions error" },
    ],
    [
      "a 190 without a revocation subcode",
      400,
      {
        code: 190,
        type: "OAuthException",
        message: "Error validating client secret.",
      },
    ],
  ])("is false for %s", async (_name, status, error) => {
    expect(isDisconnectSafeError(await unsubscribeError(status, error))).toBe(
      false,
    )
  })
})
