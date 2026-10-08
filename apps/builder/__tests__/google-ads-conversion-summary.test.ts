import { describe, expect, test } from "vitest"
import { getGoogleAdsConversionSummaryLines } from "@/features/integration-google-ads/lib/conversion-summary"

const t = ((key: string, values?: Record<string, unknown>) =>
  values
    ? `${key}:${Object.values(values).join(",")}`
    : key) as unknown as Parameters<
  typeof getGoogleAdsConversionSummaryLines
>[1]

describe("getGoogleAdsConversionSummaryLines", () => {
  test("prompts to configure when nothing is set", () => {
    expect(getGoogleAdsConversionSummaryLines(undefined, t)).toEqual([
      "googleAds.summary.notConfigured",
    ])
  })

  test("lists action, value with currency and the dedup ID in order", () => {
    expect(
      getGoogleAdsConversionSummaryLines(
        {
          conversionActionId: "42",
          value: "9.90",
          currency: "USD",
          dedupMode: "id",
          dedupId: "O-7",
        },
        t,
      ),
    ).toEqual([
      "googleAds.summary.conversionAction:42",
      "9.90 USD",
      "googleAds.summary.dedupId:O-7",
    ])
  })

  test("says once per ad click in click mode, even with a leftover ID", () => {
    expect(
      getGoogleAdsConversionSummaryLines(
        { conversionActionId: "42", dedupMode: "click", dedupId: "O-7" },
        t,
      ),
    ).toEqual([
      "googleAds.summary.conversionAction:42",
      "googleAds.summary.dedupClick",
    ])
  })

  test("says every time it runs in event mode, even with a leftover ID", () => {
    expect(
      getGoogleAdsConversionSummaryLines(
        { conversionActionId: "42", dedupMode: "event", dedupId: "O-7" },
        t,
      ),
    ).toEqual([
      "googleAds.summary.conversionAction:42",
      "googleAds.summary.dedupEvent",
    ])
  })

  test("shows no dedup line in id mode until an ID is set", () => {
    expect(
      getGoogleAdsConversionSummaryLines(
        { conversionActionId: "42", dedupMode: "id" },
        t,
      ),
    ).toEqual(["googleAds.summary.conversionAction:42"])
  })

  test("shows a value without a currency and skips empty fields", () => {
    expect(
      getGoogleAdsConversionSummaryLines(
        {
          conversionActionId: "42",
          value: "5",
          currency: "",
          dedupMode: "id",
          dedupId: "",
        },
        t,
      ),
    ).toEqual(["googleAds.summary.conversionAction:42", "5"])
  })
})
