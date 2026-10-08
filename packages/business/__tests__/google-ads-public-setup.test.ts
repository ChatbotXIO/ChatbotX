import { describe, expect, test } from "vitest"
import { toPublicGoogleAdsSetup } from "../src/integration-google-ads/public-setup"

describe("toPublicGoogleAdsSetup", () => {
  test("returns a disconnected shape when nothing is set up", () => {
    expect(toPublicGoogleAdsSetup(null)).toMatchObject({
      connected: false,
      readiness: null,
      conversionActions: [],
    })
  })

  test("exposes the normalized upload method, null when disconnected", () => {
    const connected = (auth: unknown) =>
      toPublicGoogleAdsSetup({
        readiness: "ready",
        connection: undefined,
        integration: {
          customerId: "1",
          auth,
          conversionActions: [],
        } as never,
      })

    expect(toPublicGoogleAdsSetup(null).uploadMethod).toBeNull()
    expect(
      connected({ metadata: { uploadMethod: "legacy" } }).uploadMethod,
    ).toBe("legacy")
    expect(connected({}).uploadMethod).toBe("dataManager")
  })

  test("projects only safe fields and never the credentials", () => {
    const result = toPublicGoogleAdsSetup({
      readiness: "ready",
      connection: undefined,
      integration: {
        customerId: "1112223333",
        loginCustomerId: "9998887777",
        descriptiveName: "Acme",
        currencyCode: "USD",
        setupError: null,
        auth: { accessToken: "ya29.SECRET", refreshToken: "REFRESH-SECRET" },
        developerToken: "DEV-TOKEN-SECRET",
        conversionActionsSyncedAt: new Date("2026-10-01T00:00:00Z"),
        conversionActions: [
          {
            id: "1",
            resourceName: "customers/1/conversionActions/1",
            name: "Lead",
            category: "SIGNUP",
            status: "ENABLED",
            countingType: "ONE_PER_CLICK",
            clickThroughLookbackWindowDays: 30,
            attributionModel: "EXTERNAL",
          },
          {
            id: "2",
            resourceName: "customers/1/conversionActions/2",
            name: "Old cache entry",
            category: "SIGNUP",
            status: "ENABLED",
            countingType: "MANY_PER_CLICK",
            clickThroughLookbackWindowDays: 30,
          },
        ],
      } as never,
    })

    expect(result).toMatchObject({
      connected: true,
      readiness: "ready",
      customerId: "1112223333",
      conversionActions: [
        {
          id: "1",
          name: "Lead",
          category: "SIGNUP",
          status: "ENABLED",
          countingType: "ONE_PER_CLICK",
          attributionModel: "EXTERNAL",
        },
        { id: "2", countingType: "MANY_PER_CLICK", attributionModel: null },
      ],
    })
    const wire = JSON.stringify(result)
    expect(wire).not.toContain("SECRET")
    expect(wire).not.toContain("9998887777")
    expect(wire).not.toContain("resourceName")
  })

  test("treats a never-synced cache as an empty action list", () => {
    const result = toPublicGoogleAdsSetup({
      readiness: "setup_incomplete",
      connection: undefined,
      integration: {
        customerId: "1",
        descriptiveName: null,
        currencyCode: null,
        setupError: null,
        conversionActions: null,
        conversionActionsSyncedAt: null,
      } as never,
    })

    expect(result.conversionActions).toEqual([])
  })
})
