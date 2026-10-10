import { describe, expect, test } from "vitest"
import {
  googleAdsConsentSchema,
  googleAdsEventOptionsSchema,
  googleAdsIdentityPolicyValues,
  googleAdsSettingsDocumentSchema,
  NOT_PROVIDED_CONSENT,
} from "../src/partials/google-ads"

const validDocument = {
  version: 1,
  consent: {
    adUserData: { type: "granted" },
    adPersonalization: { type: "variable", template: "{{gdpr_consent}}" },
  },
}

describe("googleAdsSettingsDocumentSchema", () => {
  test("accepts a v1 document", () => {
    expect(
      googleAdsSettingsDocumentSchema.safeParse(validDocument).success,
    ).toBe(true)
  })

  test("accepts the not-provided default wrapped in v1", () => {
    const result = googleAdsSettingsDocumentSchema.safeParse({
      version: 1,
      consent: NOT_PROVIDED_CONSENT,
    })

    expect(result.success).toBe(true)
  })

  test("rejects an unknown version", () => {
    expect(
      googleAdsSettingsDocumentSchema.safeParse({
        ...validDocument,
        version: 2,
      }).success,
    ).toBe(false)
  })

  test("rejects a missing version", () => {
    expect(
      googleAdsSettingsDocumentSchema.safeParse({
        consent: validDocument.consent,
      }).success,
    ).toBe(false)
  })
})

describe("googleAdsConsentSchema", () => {
  const withTemplate = (template: string) => ({
    adUserData: { type: "variable", template },
    adPersonalization: { type: "notProvided" },
  })

  test("rejects a variable source without a placeholder", () => {
    const result = googleAdsConsentSchema.safeParse(withTemplate("granted"))

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      "googleAds.consent.validation.templateRequired",
    )
  })

  test("rejects an empty template", () => {
    expect(googleAdsConsentSchema.safeParse(withTemplate("  ")).success).toBe(
      false,
    )
  })

  test("rejects a template over 200 characters", () => {
    const template = `{{field}}${"x".repeat(200)}`

    const result = googleAdsConsentSchema.safeParse(withTemplate(template))

    expect(result.error?.issues[0]?.message).toBe(
      "googleAds.consent.validation.templateTooLong",
    )
  })

  test("strips a leftover template from a non-variable source", () => {
    const result = googleAdsConsentSchema.parse({
      adUserData: { type: "granted", template: "{{x}}" },
      adPersonalization: { type: "denied" },
    })

    expect(result.adUserData).toEqual({ type: "granted" })
  })

  test("rejects an unknown source type", () => {
    expect(
      googleAdsConsentSchema.safeParse({
        adUserData: { type: "maybe" },
        adPersonalization: { type: "denied" },
      }).success,
    ).toBe(false)
  })
})

const validOptions = (overrides: { id?: string | null } = {}) => ({
  version: 1,
  identity: {
    version: 1,
    configuredPolicy: "id",
    effectivePolicy: "id",
    keySource: "explicit",
    id: "id" in overrides ? overrides.id : "A-1042",
  },
  timeSource: "provided",
  consent: {
    adUserData: { status: "granted", source: "fixed" },
    adPersonalization: { status: null, source: "notProvided" },
  },
})

describe("googleAdsEventOptionsSchema", () => {
  test("accepts v1 options with an identity block", () => {
    expect(googleAdsEventOptionsSchema.safeParse(validOptions()).success).toBe(
      true,
    )
  })

  test("accepts a v2 snapshot with customer matching sources and no values", () => {
    const options = {
      ...validOptions(),
      version: 2,
      matching: {
        status: "enabled",
        email: "{{email}}",
        phone: "{{phone}}",
      },
    }

    expect(googleAdsEventOptionsSchema.safeParse(options).success).toBe(true)
  })

  test.each([
    ["an unknown status", { status: "sent", email: null, phone: null }],
    [
      "an object source",
      { status: "enabled", email: { type: "contact" }, phone: null },
    ],
    ["an empty template", { status: "enabled", email: "", phone: null }],
    ["a missing source key", { status: "enabled", phone: null }],
  ])("rejects v2 matching with %s", (_label, matching) => {
    expect(
      googleAdsEventOptionsSchema.safeParse({
        ...validOptions(),
        version: 2,
        matching,
      }).success,
    ).toBe(false)
  })

  test("accepts a v2 snapshot with customer properties", () => {
    const options = {
      ...validOptions(),
      version: 2,
      customerProperties: {
        status: "enabled",
        customerType: "NEW",
        customerValueBucket: null,
      },
    }

    expect(googleAdsEventOptionsSchema.safeParse(options).success).toBe(true)
  })

  test.each([
    [
      "an unknown status",
      { status: "sent", customerType: null, customerValueBucket: null },
    ],
    [
      "an unknown type",
      { status: "enabled", customerType: "VIP", customerValueBucket: null },
    ],
    [
      "a lowercase bucket",
      { status: "enabled", customerType: null, customerValueBucket: "high" },
    ],
    ["a missing key", { status: "enabled", customerType: "NEW" }],
  ])("rejects v2 customer properties with %s", (_label, customerProperties) => {
    expect(
      googleAdsEventOptionsSchema.safeParse({
        ...validOptions(),
        version: 2,
        customerProperties,
      }).success,
    ).toBe(false)
  })

  test("accepts a click identity with a null id", () => {
    const options = validOptions({ id: null })
    options.identity.configuredPolicy = "click"
    options.identity.effectivePolicy = "click"
    options.identity.keySource = "click"

    expect(googleAdsEventOptionsSchema.safeParse(options).success).toBe(true)
  })

  test("accepts an id of exactly 64 characters", () => {
    expect(
      googleAdsEventOptionsSchema.safeParse(
        validOptions({ id: "x".repeat(64) }),
      ).success,
    ).toBe(true)
  })

  test("rejects an id longer than 64 characters", () => {
    expect(
      googleAdsEventOptionsSchema.safeParse(
        validOptions({ id: "x".repeat(65) }),
      ).success,
    ).toBe(false)
  })

  test("rejects an empty id", () => {
    expect(
      googleAdsEventOptionsSchema.safeParse(validOptions({ id: "" })).success,
    ).toBe(false)
  })

  test("rejects an unknown version", () => {
    expect(
      googleAdsEventOptionsSchema.safeParse({ ...validOptions(), version: 3 })
        .success,
    ).toBe(false)
  })

  test("rejects a policy outside click, id and event", () => {
    const options = validOptions()
    options.identity.configuredPolicy = "everything"

    expect(googleAdsEventOptionsSchema.safeParse(options).success).toBe(false)
    expect(googleAdsIdentityPolicyValues).toEqual(["click", "id", "event"])
  })

  test("accepts an event-policy snapshot that keeps no key", () => {
    const options = validOptions()
    options.identity.configuredPolicy = "event"
    options.identity.effectivePolicy = "event"
    options.identity.keySource = "occurrence"
    options.identity.id = null

    expect(googleAdsEventOptionsSchema.safeParse(options).success).toBe(true)
  })

  test("rejects a consent status other than granted, denied or null", () => {
    const options = validOptions()
    options.consent.adUserData.status = "unknown"

    expect(googleAdsEventOptionsSchema.safeParse(options).success).toBe(false)
  })
})
