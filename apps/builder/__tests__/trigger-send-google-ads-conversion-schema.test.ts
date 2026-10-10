import { triggerActions } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { allActions } from "@/features/triggers/components/actions/schema"
import {
  defaultFn,
  sendGoogleAdsConversion,
} from "@/features/triggers/components/actions/schema/send-google-ads-conversion"

describe("trigger send Google Ads conversion action schema", () => {
  test("default action is the shape the worker executor safeParses", () => {
    expect(defaultFn()).toMatchObject({
      type: "sendGoogleAdsConversion",
      conversionActionId: "",
      dedupMode: "id",
      dedupId: undefined,
      conversionTime: undefined,
    })
    expect(defaultFn()).not.toHaveProperty("orderId")
  })

  test("rejects an empty conversion action id", () => {
    expect(sendGoogleAdsConversion.safeParse(defaultFn()).success).toBe(false)
  })

  test("rejects a non-numeric conversion action id", () => {
    const result = sendGoogleAdsConversion.safeParse({
      ...defaultFn(),
      conversionActionId: "abc",
    })

    expect(result.success).toBe(false)
  })

  test("accepts a numeric id with no value or currency", () => {
    const result = sendGoogleAdsConversion.safeParse({
      ...defaultFn(),
      conversionActionId: "123",
      dedupMode: "click",
    })

    expect(result.success).toBe(true)
  })

  test("id mode requires the dedup ID with an i18n-key message", () => {
    const result = sendGoogleAdsConversion.safeParse({
      ...defaultFn(),
      conversionActionId: "123",
      dedupMode: "id",
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]).toMatchObject({
      path: ["dedupId"],
      message: "googleAds.conversionFields.validation.dedupIdRequired",
    })
  })

  test("bounds the dedup ID at 64 characters in id mode only", () => {
    const base = { ...defaultFn(), conversionActionId: "123" }
    const tooLong = "x".repeat(65)

    const idMode = sendGoogleAdsConversion.safeParse({
      ...base,
      dedupMode: "id",
      dedupId: tooLong,
    })
    expect(idMode.success).toBe(false)
    expect(idMode.error?.issues[0]).toMatchObject({
      path: ["dedupId"],
      message: "googleAds.conversionFields.validation.dedupIdTooLong",
    })
    expect(
      sendGoogleAdsConversion.safeParse({
        ...base,
        dedupMode: "id",
        dedupId: "x".repeat(64),
      }).success,
    ).toBe(true)
    expect(
      sendGoogleAdsConversion.safeParse({
        ...base,
        dedupMode: "click",
        dedupId: tooLong,
      }).success,
    ).toBe(true)
  })

  test("requires dedupMode (no default)", () => {
    const { dedupMode: _dedupMode, ...withoutMode } = defaultFn()

    expect(
      sendGoogleAdsConversion.safeParse({
        ...withoutMode,
        conversionActionId: "123",
      }).success,
    ).toBe(false)
  })

  test("requires value and currency together", () => {
    const base = {
      ...defaultFn(),
      conversionActionId: "123",
      dedupMode: "click" as const,
    }

    expect(
      sendGoogleAdsConversion.safeParse({ ...base, value: "10" }).success,
    ).toBe(false)
    expect(
      sendGoogleAdsConversion.safeParse({ ...base, currency: "USD" }).success,
    ).toBe(false)
    expect(
      sendGoogleAdsConversion.safeParse({
        ...base,
        value: "10",
        currency: "USD",
        dedupMode: "id",
        dedupId: "ORDER-1",
      }).success,
    ).toBe(true)
  })

  test("is registered in the trigger action union", () => {
    expect(Object.values(allActions)).toContain(sendGoogleAdsConversion)
    expect(triggerActions.options).toContain("sendGoogleAdsConversion")
  })
})
