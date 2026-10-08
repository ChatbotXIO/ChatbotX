import { describe, expect, test } from "vitest"
import {
  resolveGoogleAdsClick,
  selectGoogleAdsBadge,
} from "../src/google-ads/click-fields"

describe("resolveGoogleAdsClick", () => {
  test("returns null without a referral or click id", () => {
    expect(resolveGoogleAdsClick(null)).toBeNull()
    expect(resolveGoogleAdsClick(undefined)).toBeNull()
    expect(resolveGoogleAdsClick({})).toBeNull()
    expect(resolveGoogleAdsClick({ gclid: null, gbraid: "" })).toBeNull()
  })

  test("reports the click type and capture time but never the id", () => {
    const result = resolveGoogleAdsClick({
      gclid: "secret-gclid",
      googleClickReceivedAt: "2026-10-01T00:00:00Z",
    })
    expect(result).toEqual({
      clickIdType: "gclid",
      receivedAt: "2026-10-01T00:00:00Z",
    })
    expect(JSON.stringify(result)).not.toContain("secret-gclid")
  })

  test("reports gbraid when only gbraid is present", () => {
    const result = resolveGoogleAdsClick({ gbraid: "secret-gbraid" })
    expect(result).toEqual({ clickIdType: "gbraid", receivedAt: null })
    expect(JSON.stringify(result)).not.toContain("secret-gbraid")
  })

  test("prefers gclid when both are present", () => {
    expect(
      resolveGoogleAdsClick({ gclid: "a", gbraid: "b" })?.clickIdType,
    ).toBe("gclid")
  })
})

describe("selectGoogleAdsBadge", () => {
  const click = { clickIdType: "gclid", receivedAt: null } as const

  test("returns null for missing or click-less inboxes", () => {
    expect(selectGoogleAdsBadge(null)).toBeNull()
    expect(selectGoogleAdsBadge(undefined)).toBeNull()
    expect(selectGoogleAdsBadge([])).toBeNull()
    expect(
      selectGoogleAdsBadge([{ channel: "messenger", googleAdsClick: null }]),
    ).toBeNull()
  })

  test("picks the first inbox that carries a click", () => {
    expect(
      selectGoogleAdsBadge([
        { channel: "messenger", googleAdsClick: null },
        { channel: "whatsapp", googleAdsClick: click },
        {
          channel: "instagram",
          googleAdsClick: { clickIdType: "gbraid", receivedAt: null },
        },
      ]),
    ).toEqual({ channel: "whatsapp", clickIdType: "gclid" })
  })
})
