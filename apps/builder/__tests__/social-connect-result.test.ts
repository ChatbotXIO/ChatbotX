import { describe, expect, test } from "vitest"
import {
  buildSocialConnectRedirectUrl,
  readSocialConnectResult,
  SOCIAL_CONNECT_SUCCESS,
  socialConnectFailure,
} from "@/features/social-accounts/lib/social-connect-result"

const REFERER = "https://builder.example.test/space/1/posts"

const roundTrip = (
  result: Parameters<typeof buildSocialConnectRedirectUrl>[1],
) =>
  readSocialConnectResult(
    new URL(buildSocialConnectRedirectUrl(REFERER, result)).searchParams,
  )

describe("social connect result", () => {
  test("success survives the redirect", () => {
    expect(roundTrip(SOCIAL_CONNECT_SUCCESS)).toEqual(SOCIAL_CONNECT_SUCCESS)
  })

  test("a failure carries its reason", () => {
    expect(roundTrip(socialConnectFailure("cancelled"))).toEqual({
      missingPermissions: [],
      ok: false,
      reason: "cancelled",
    })
  })

  test("missing permission names are kept verbatim", () => {
    const result = socialConnectFailure("permissionNotGranted", [
      "pages_manage_posts",
      "threads_content_publish",
    ])

    expect(roundTrip(result)).toEqual(result)
  })

  test("a page reached without a connect has no result", () => {
    expect(readSocialConnectResult(new URLSearchParams())).toBeNull()
  })

  test("an unknown reason reads as a plain failure", () => {
    expect(
      readSocialConnectResult(
        new URLSearchParams("socialConnect=error&socialReason=bogus"),
      ),
    ).toMatchObject({ ok: false, reason: "failed" })
  })

  test("the redirect keeps the referer's own query", () => {
    const url = new URL(
      buildSocialConnectRedirectUrl(
        `${REFERER}?tab=accounts`,
        SOCIAL_CONNECT_SUCCESS,
      ),
    )

    expect(url.searchParams.get("tab")).toBe("accounts")
    expect(url.searchParams.get("socialConnect")).toBe("success")
  })
})
