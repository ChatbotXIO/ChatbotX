import { describe, expect, test } from "vitest"
import type { IntegrationFacebookAdsResource } from "../../schemas"
import { needsFacebookAdsReconnect } from "../needs-reconnect"

const baseIntegration = {
  id: "ifa-1",
  workspaceId: "ws-1",
  integrationId: "int-1",
  tokenExpiresAt: null,
  status: "active",
} satisfies IntegrationFacebookAdsResource

describe("needsFacebookAdsReconnect", () => {
  test("returns true when the integration status is invalid", () => {
    expect(
      needsFacebookAdsReconnect({
        ...baseIntegration,
        status: "invalid",
      }),
    ).toBe(true)
  })

  test("returns true when tokenExpiresAt is in the past", () => {
    expect(
      needsFacebookAdsReconnect({
        ...baseIntegration,
        tokenExpiresAt: new Date("2026-08-10T00:00:00Z"),
      }),
    ).toBe(true)
  })

  test("returns false for a healthy future token", () => {
    expect(
      needsFacebookAdsReconnect({
        ...baseIntegration,
        tokenExpiresAt: new Date("2999-01-01T00:00:00Z"),
      }),
    ).toBe(false)
  })

  test("returns false when tokenExpiresAt is null and status is connected", () => {
    expect(needsFacebookAdsReconnect(baseIntegration)).toBe(false)
  })
})
