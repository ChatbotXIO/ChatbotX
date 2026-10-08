import { describe, expect, test } from "vitest"
import {
  actionSteps,
  googleAdsConversionFieldsSchema,
  sendGoogleAdsConversionDefaultFn,
  sendGoogleAdsConversionSchema,
  stepTypes,
} from "../src"

const configured = () => ({
  ...sendGoogleAdsConversionDefaultFn(),
  conversionActionId: "123456789",
  dedupMode: "click" as const,
})

const issuesOf = (input: unknown) => {
  const result = sendGoogleAdsConversionSchema.safeParse(input)
  return result.success ? [] : result.error.issues
}

describe("Send Google Ads conversion flow contract", () => {
  test("default fn is an unconfigured step with success/error states", () => {
    const defaults = sendGoogleAdsConversionDefaultFn()

    expect(defaults.stepType).toBe("sendGoogleAdsConversion")
    expect(defaults.conversionActionId).toBe("")
    expect(defaults.dedupMode).toBe("id")
    expect(defaults.dedupId).toBeUndefined()
    expect(defaults.conversionTime).toBeUndefined()
    expect(defaults.states).toHaveLength(2)
    expect(sendGoogleAdsConversionSchema.safeParse(defaults).success).toBe(
      false,
    )
  })

  test("is registered as a step type and an action step", () => {
    expect(stepTypes.options).toContain("sendGoogleAdsConversion")
    expect(actionSteps).toContain(sendGoogleAdsConversionSchema)
  })

  test("accepts a numeric conversion action id", () => {
    expect(sendGoogleAdsConversionSchema.parse(configured())).toEqual(
      expect.objectContaining({
        stepType: "sendGoogleAdsConversion",
        conversionActionId: "123456789",
      }),
    )
  })

  test.each([
    "",
    "abc",
    "12a",
    "12 3",
    "-1",
  ])("rejects conversion action id %j", (conversionActionId) => {
    expect(
      sendGoogleAdsConversionSchema.safeParse({
        ...configured(),
        conversionActionId,
      }).success,
    ).toBe(false)
  })

  test("rejects the wrong step type", () => {
    expect(
      sendGoogleAdsConversionSchema.safeParse({
        ...configured(),
        stepType: "sendText",
      }).success,
    ).toBe(false)
  })

  test("normalises a static value and currency", () => {
    const parsed = sendGoogleAdsConversionSchema.parse({
      ...configured(),
      value: "49.90",
      currency: "usd",
    })

    expect(parsed.value).toBe("49.90")
    expect(parsed.currency).toBe("USD")
  })

  test("passes {{variable}} templates through untouched", () => {
    const parsed = sendGoogleAdsConversionSchema.parse({
      ...configured(),
      value: "{{order_total}}",
      currency: "{{currency_field}}",
      dedupMode: "id",
      dedupId: "{{order_id}}",
      conversionTime: "{{closed_at}}",
    })

    expect(parsed.value).toBe("{{order_total}}")
    expect(parsed.currency).toBe("{{currency_field}}")
    expect(parsed.dedupId).toBe("{{order_id}}")
    expect(parsed.conversionTime).toBe("{{closed_at}}")
  })

  test("rejects a malformed static value or currency", () => {
    expect(
      sendGoogleAdsConversionSchema.safeParse({
        ...configured(),
        value: "abc",
        currency: "USD",
      }).success,
    ).toBe(false)
    expect(
      sendGoogleAdsConversionSchema.safeParse({
        ...configured(),
        value: "10",
        currency: "dollars",
      }).success,
    ).toBe(false)
  })

  test("treats blank value, currency, dedup id and conversion time as unset", () => {
    const parsed = sendGoogleAdsConversionSchema.parse({
      ...configured(),
      value: "  ",
      currency: "",
      dedupId: " ",
      conversionTime: "",
    })

    expect(parsed.value).toBeUndefined()
    expect(parsed.currency).toBeUndefined()
    expect(parsed.dedupId).toBeUndefined()
    expect(parsed.conversionTime).toBeUndefined()
  })

  test("requires value and currency together or neither", () => {
    expect(
      sendGoogleAdsConversionSchema.safeParse({ ...configured(), value: "5" })
        .success,
    ).toBe(false)
    expect(
      sendGoogleAdsConversionSchema.safeParse({
        ...configured(),
        currency: "USD",
      }).success,
    ).toBe(false)
    expect(
      sendGoogleAdsConversionSchema.safeParse({
        ...configured(),
        value: "5",
        currency: "USD",
      }).success,
    ).toBe(true)
    expect(sendGoogleAdsConversionSchema.safeParse(configured()).success).toBe(
      true,
    )
  })

  test("has no orderId field any more", () => {
    expect(Object.keys(googleAdsConversionFieldsSchema.shape)).not.toContain(
      "orderId",
    )
  })

  test("dedupMode is required: no silent default for flow-spec authors", () => {
    const { dedupMode: _omitted, ...withoutMode } = configured()

    expect(
      issuesOf(withoutMode).some((issue) => issue.path[0] === "dedupMode"),
    ).toBe(true)
    expect(
      sendGoogleAdsConversionSchema.safeParse({
        ...configured(),
        dedupMode: "unknown",
      }).success,
    ).toBe(false)
  })

  test.each([
    [{ matchEmail: "{{email}}", matchPhone: "{{phone}}" }, true],
    [{ matchEmail: "{{custom_work_email}}" }, true],
    [{ matchEmail: "", matchPhone: "" }, true],
    [{}, true],
    [{ matchEmail: "jane@example.com" }, false],
    [{ matchPhone: "+84901234567" }, false],
    [{ matchEmail: "{{email}} " }, true],
    [{ matchEmail: "mail: {{email}}" }, false],
    [{ matchEmail: "{{email}}{{phone}}" }, false],
    [{ matchEmail: "{{}}" }, false],
    [{ matchEmail: `{{${"a".repeat(196)}}}` }, true],
    [{ matchEmail: `{{${"a".repeat(197)}}}` }, false],
  ])("customer matching variables %j are valid: %s", (matching, valid) => {
    expect(
      sendGoogleAdsConversionSchema.safeParse({ ...configured(), ...matching })
        .success,
    ).toBe(valid)
  })

  test("a literal e-mail is refused with an i18n key, never echoed", () => {
    const issues = issuesOf({ ...configured(), matchEmail: "jane@example.com" })

    expect(issues).toContainEqual(
      expect.objectContaining({
        path: ["matchEmail"],
        message: "googleAds.conversionFields.validation.matchTemplateInvalid",
      }),
    )
    expect(JSON.stringify(issues)).not.toContain("jane@example.com")
  })

  test.each([
    [{ customerType: "NEW", customerValueBucket: "HIGH" }, true],
    [{ customerType: "returning", customerValueBucket: " low " }, true],
    [
      { customerType: "{{contact.type}}", customerValueBucket: "{{tier}}" },
      true,
    ],
    [{ customerType: "", customerValueBucket: "" }, true],
    [{}, true],
    [{ customerType: "VIP" }, false],
    [{ customerType: "REENGAGED" }, false],
    [{ customerValueBucket: "GOLD" }, false],
    // A template is checked only once it is resolved, at record time.
    [{ customerType: "{{a}} NEW" }, true],
  ])("customer properties %j are valid: %s", (properties, valid) => {
    expect(
      sendGoogleAdsConversionSchema.safeParse({
        ...configured(),
        ...properties,
      }).success,
    ).toBe(valid)
  })

  test("a static customer property is normalised to upper case", () => {
    const parsed = sendGoogleAdsConversionSchema.parse({
      ...configured(),
      customerType: " new ",
      customerValueBucket: "medium",
    })

    expect(parsed.customerType).toBe("NEW")
    expect(parsed.customerValueBucket).toBe("MEDIUM")
  })

  test("an invalid customer property is refused with an i18n key", () => {
    expect(issuesOf({ ...configured(), customerType: "VIP" })).toContainEqual(
      expect.objectContaining({
        path: ["customerType"],
        message: "googleAds.conversionFields.validation.customerTypeInvalid",
      }),
    )
    expect(
      issuesOf({ ...configured(), customerValueBucket: "GOLD" }),
    ).toContainEqual(
      expect.objectContaining({
        path: ["customerValueBucket"],
        message:
          "googleAds.conversionFields.validation.customerValueBucketInvalid",
      }),
    )
  })

  test("a new step sets no customer properties", () => {
    const step = sendGoogleAdsConversionDefaultFn()

    expect(step.customerType).toBeUndefined()
    expect(step.customerValueBucket).toBeUndefined()
  })

  test("a new step has customer matching off", () => {
    const step = sendGoogleAdsConversionDefaultFn()

    expect(step.matchEmail).toBeUndefined()
    expect(step.matchPhone).toBeUndefined()
  })

  test("event mode needs no dedup id: every run is its own conversion", () => {
    const { dedupId: _ignored, ...withoutId } = configured()

    expect(
      sendGoogleAdsConversionSchema.safeParse({
        ...withoutId,
        dedupMode: "event",
      }).success,
    ).toBe(true)
  })

  test("id mode requires a dedup id with an i18n-key message", () => {
    const issues = issuesOf({ ...configured(), dedupMode: "id" })

    expect(issues).toContainEqual(
      expect.objectContaining({
        path: ["dedupId"],
        message: "googleAds.conversionFields.validation.dedupIdRequired",
      }),
    )
  })

  test("click mode does not require a dedup id", () => {
    expect(sendGoogleAdsConversionSchema.safeParse(configured()).success).toBe(
      true,
    )
  })

  test("id mode accepts a static id or a template", () => {
    for (const dedupId of ["A-1042", "{{order_number}}"]) {
      expect(
        sendGoogleAdsConversionSchema.safeParse({
          ...configured(),
          dedupMode: "id",
          dedupId,
        }).success,
      ).toBe(true)
    }
  })

  test("bounds the dedup id at 64 characters", () => {
    const withId = (dedupId: string) => ({
      ...configured(),
      dedupMode: "id" as const,
      dedupId,
    })

    expect(
      sendGoogleAdsConversionSchema.safeParse(withId("x".repeat(64))).success,
    ).toBe(true)
    expect(issuesOf(withId("x".repeat(65)))).toContainEqual(
      expect.objectContaining({
        path: ["dedupId"],
        message: "googleAds.conversionFields.validation.dedupIdTooLong",
      }),
    )
  })

  test("the length check applies to id mode only", () => {
    const tooLong = "x".repeat(65)

    expect(
      sendGoogleAdsConversionSchema.safeParse({
        ...configured(),
        dedupMode: "click",
        dedupId: tooLong,
      }).success,
    ).toBe(true)
    expect(
      sendGoogleAdsConversionSchema.safeParse({
        ...configured(),
        dedupMode: "click",
        dedupId: " ",
      }).success,
    ).toBe(true)
    expect(
      sendGoogleAdsConversionSchema.safeParse({
        ...configured(),
        dedupMode: "id",
        dedupId: `{{order_id}}-${tooLong}`,
      }).success,
    ).toBe(true)
  })

  test("validation messages are i18n keys", () => {
    expect(
      issuesOf({ ...configured(), value: "5" }).map((issue) => issue.message),
    ).toContain("googleAds.conversionFields.validation.currencyRequired")
    expect(
      issuesOf({ ...configured(), currency: "USD" }).map(
        (issue) => issue.message,
      ),
    ).toContain("googleAds.conversionFields.validation.valueRequired")
  })

  test.each([
    "2026-10-08T14:30:00Z",
    "2026-10-08T14:30:00+07:00",
    "{{crm_closed_at}}",
  ])("accepts conversion time %j", (conversionTime) => {
    expect(
      sendGoogleAdsConversionSchema.safeParse({
        ...configured(),
        conversionTime,
      }).success,
    ).toBe(true)
  })

  test.each([
    ["2026-10-08T14:30:00", "googleAds.conversionFields.validation.timeFormat"],
    ["2026-10-08", "googleAds.conversionFields.validation.timeFormat"],
    [
      "2026-02-30T10:00:00Z",
      "googleAds.conversionFields.validation.timeInvalidDate",
    ],
  ])("rejects static conversion time %j with a key", (conversionTime, message) => {
    expect(issuesOf({ ...configured(), conversionTime })).toContainEqual(
      expect.objectContaining({ message }),
    )
  })

  test("a future static time is a runtime refusal, not a schema error", () => {
    expect(
      sendGoogleAdsConversionSchema.safeParse({
        ...configured(),
        conversionTime: "2999-01-01T00:00:00Z",
      }).success,
    ).toBe(true)
  })

  test("the shared field schema parses a stored trigger action object", () => {
    const parsed = googleAdsConversionFieldsSchema.safeParse({
      type: "sendGoogleAdsConversion",
      conversionActionId: "42",
      dedupMode: "click",
    })

    expect(parsed.success).toBe(true)
  })
})
