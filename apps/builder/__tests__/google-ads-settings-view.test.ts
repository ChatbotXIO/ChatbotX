import { describe, expect, test } from "vitest"
import { toGoogleAdsSettingsView } from "@/features/integration-google-ads/lib/to-settings-view"

describe("toGoogleAdsSettingsView", () => {
  test("is null when nothing is set up", () => {
    expect(toGoogleAdsSettingsView(null)).toBeNull()
  })

  test("never carries satellite auth, tokens, or the connection row", () => {
    const view = toGoogleAdsSettingsView({
      readiness: "ready",
      connection: {
        status: "degraded",
        accessToken: "CONN-ACCESS-SECRET",
      },
      integration: {
        customerId: "1112223333",
        loginCustomerId: null,
        descriptiveName: "Acme",
        currencyCode: "USD",
        conversionCustomerId: "1112223333",
        acceptedCustomerDataTerms: true,
        setupError: null,
        auth: {
          accessToken: "ya29.SECRET",
          refreshToken: "REFRESH-SECRET",
          metadata: { uploadMethod: "legacy" },
        },
        developerToken: "DEV-TOKEN-SECRET",
        conversionActionsSyncedAt: null,
        conversionActions: [
          {
            id: "1",
            resourceName: "customers/1/conversionActions/1",
            name: "Lead",
            category: "SIGNUP",
            status: "ENABLED",
            countingType: "ONE_PER_CLICK",
            clickThroughLookbackWindowDays: 30,
          },
        ],
      },
    } as never)

    const wire = JSON.stringify(view)
    expect(view?.connectionStatus).toBe("degraded")
    expect(view?.uploadMethod).toBe("legacy")
    expect(wire).not.toContain("SECRET")
    expect(wire).not.toContain("auth")
    expect(wire).not.toContain("resourceName")
  })

  test.each([
    [undefined, "dataManager"],
    [{}, "dataManager"],
    [{ metadata: { uploadMethod: "bogus" } }, "dataManager"],
    [{ metadata: { uploadMethod: "dataManager" } }, "dataManager"],
    [{ metadata: { uploadMethod: "legacy" } }, "legacy"],
  ])("normalizes auth %j to %s", (auth, expected) => {
    const view = toGoogleAdsSettingsView({
      readiness: "ready",
      connection: undefined,
      integration: {
        customerId: "1",
        loginCustomerId: null,
        descriptiveName: null,
        currencyCode: null,
        conversionCustomerId: null,
        acceptedCustomerDataTerms: null,
        setupError: null,
        auth,
        conversionActionsSyncedAt: null,
        conversionActions: [],
      },
    } as never)
    expect(view?.uploadMethod).toBe(expected)
  })
})
