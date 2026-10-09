import { googleAdsConversionErrorCodes } from "@chatbotx.io/utils/google-click"
import { describe, expect, test, vi } from "vitest"
import { z } from "zod"

vi.mock("@chatbotx.io/business/error-log", () => ({
  logProviderError: vi.fn(),
}))

const { describeGoogleAdsInputFailure } = await import(
  "../src/integration/handlers/google-ads/google-ads-input-error"
)

const KEY = "googleAds.conversionFields.validation.dedupIdRequired"

describe("describeGoogleAdsInputFailure", () => {
  test("prints each zod issue as a plain `path: message` line under the code", () => {
    const result = z
      .object({ a: z.object({ dedupId: z.string() }) })
      .superRefine((_data, ctx) => {
        ctx.addIssue({ code: "custom", path: ["a", "dedupId"], message: KEY })
        ctx.addIssue({ code: "custom", path: [], message: "whole object" })
      })
      .safeParse({ a: { dedupId: "x" } })
    if (result.success) {
      throw new Error("expected a failure")
    }

    const text = describeGoogleAdsInputFailure(
      googleAdsConversionErrorCodes.invalidInput,
      { value: "5" },
      result.error,
    )

    expect(text.split("\n")).toEqual([
      googleAdsConversionErrorCodes.invalidInput,
      `a.dedupId: ${KEY}`,
      "whole object",
      'Resolved: value="5"',
    ])
    expect(text).not.toContain("✖")
  })

  test("prints only the allowlisted fields, never an extra runtime key", () => {
    const resolved = {
      value: "5",
      currency: "USD",
      dedupId: "O-1",
      conversionTime: "2026-10-08T14:30:00+07:00",
      emailAddress: "customer@example.com",
      phoneNumber: "+84901234567",
    }

    const text = describeGoogleAdsInputFailure(
      googleAdsConversionErrorCodes.invalidInput,
      resolved,
    )

    expect(text).toContain('value="5"')
    expect(text).toContain('conversionTime="2026-10-08T14:30:00+07:00"')
    expect(text).not.toContain("customer@example.com")
    expect(text).not.toContain("+84901234567")
  })

  test("never prints the resolved customer properties", () => {
    const text = describeGoogleAdsInputFailure(
      googleAdsConversionErrorCodes.invalidCustomerProperty,
      { customerType: "Jane Doe", customerValueBucket: "GOLD" },
    )

    expect(text.split("\n")[0]).toBe("google_ads_invalid_customer_property")
    expect(text).not.toContain("Jane")
    expect(text).not.toContain("GOLD")
    expect(text).toContain('customerType="[withheld]"')
    expect(text).toContain('customerValueBucket="[withheld]"')
  })

  test.each([
    "jane@example.com",
    "+84901234567",
    "a".repeat(64),
    "84901234567",
  ])("withholds a customer property that looks like personal data: %s", (leaked) => {
    const text = describeGoogleAdsInputFailure(
      googleAdsConversionErrorCodes.invalidCustomerProperty,
      { customerType: leaked, customerValueBucket: leaked },
    )

    expect(text).not.toContain(leaked)
    expect(text).toContain('customerType="[withheld]"')
  })
})
