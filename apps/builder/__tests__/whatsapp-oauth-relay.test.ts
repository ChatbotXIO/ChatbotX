import { describe, expect, test } from "vitest"
import { WA_OAUTH_RESULT } from "@/features/integration-whatsapp/libs/embedded-signup"
import { parseOAuthRelayResult } from "@/features/integration-whatsapp/libs/oauth-relay"

const expectedOrigin = "https://broker.example.com"

describe("parseOAuthRelayResult", () => {
  test("ignores messages from the wrong origin", () => {
    expect(
      parseOAuthRelayResult({
        origin: "https://attacker.example.com",
        expectedOrigin,
        data: {
          type: WA_OAUTH_RESULT,
          status: "success",
          code: "oauth-code",
        },
      }),
    ).toEqual({ type: "ignored" })
  })

  test("ignores non-relay data from the expected origin", () => {
    expect(
      parseOAuthRelayResult({
        origin: expectedOrigin,
        expectedOrigin,
        data: { type: "OTHER_MESSAGE", status: "success", code: "oauth-code" },
      }),
    ).toEqual({ type: "ignored" })
  })

  test("returns success when the relay payload contains a code", () => {
    expect(
      parseOAuthRelayResult({
        origin: expectedOrigin,
        expectedOrigin,
        data: {
          type: WA_OAUTH_RESULT,
          status: "success",
          code: "oauth-code",
        },
      }),
    ).toEqual({ type: "success", code: "oauth-code" })
  })

  test("returns error when the relay success payload omits the code", () => {
    expect(
      parseOAuthRelayResult({
        origin: expectedOrigin,
        expectedOrigin,
        data: { type: WA_OAUTH_RESULT, status: "success" },
      }),
    ).toEqual({ type: "error" })
  })

  test("returns error when the relay reports an error status", () => {
    expect(
      parseOAuthRelayResult({
        origin: expectedOrigin,
        expectedOrigin,
        data: { type: WA_OAUTH_RESULT, status: "error" },
      }),
    ).toEqual({ type: "error" })
  })

  test("trusts a tenant's own custom domain as the expected origin, not just the broker", () => {
    const tenantOrigin = "https://reseller.example.com"
    expect(
      parseOAuthRelayResult({
        origin: tenantOrigin,
        expectedOrigin: tenantOrigin,
        data: {
          type: WA_OAUTH_RESULT,
          status: "success",
          code: "oauth-code",
        },
      }),
    ).toEqual({ type: "success", code: "oauth-code" })

    expect(
      parseOAuthRelayResult({
        origin: expectedOrigin,
        expectedOrigin: tenantOrigin,
        data: {
          type: WA_OAUTH_RESULT,
          status: "success",
          code: "oauth-code",
        },
      }),
    ).toEqual({ type: "ignored" })
  })
})
