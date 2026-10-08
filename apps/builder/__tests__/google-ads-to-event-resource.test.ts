import type { GoogleAdsEventOptions } from "@chatbotx.io/database/partials"
import type { GoogleAdsConversionEventModel } from "@chatbotx.io/database/types"
import { describe, expect, test } from "vitest"
import { toGoogleAdsEventResource } from "@/features/integration-google-ads/lib/to-event-resource"

const options = (
  overrides: Partial<GoogleAdsEventOptions> = {},
): GoogleAdsEventOptions => ({
  version: 1,
  identity: {
    version: 1,
    configuredPolicy: "id",
    effectivePolicy: "id",
    keySource: "explicit",
    id: "A-1042",
  },
  timeSource: "recorded",
  consent: {
    adUserData: { status: "granted", source: "fixed" },
    adPersonalization: { status: "denied", source: "variable" },
  },
  ...overrides,
})

const row = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "900",
    status: "processed",
    failureStage: null,
    processingStatus: "success",
    error: null,
    channel: "whatsapp",
    conversionActionName: "Purchase",
    uploadMethod: "dataManager",
    clickIdType: "gclid",
    clickId: "Cj0KCQiAFULLCLICKIDxyz9",
    conversionActionId: "7788",
    transactionId: "gads-ws1-9f8e7d6c",
    requestId: "req-7c1a-4b2d",
    occurredAt: new Date("2026-10-01T00:00:00Z"),
    sentAt: null,
    value: null,
    currency: null,
    options: options(),
    ...overrides,
  }) as unknown as GoogleAdsConversionEventModel

const deliveryOf = (overrides: Record<string, unknown>) =>
  toGoogleAdsEventResource(row(overrides)).consentSnapshot?.delivery

describe("toGoogleAdsEventResource: consent delivery", () => {
  test.each([
    ["sent", null, "sent"],
    ["processed", null, "sent"],
    ["failed", "processing", "sent"],
    ["failed", "timeout", "sent"],
    ["pending", null, "toSend"],
    ["sending", null, "toSend"],
    ["skipped_no_account", null, "notSent"],
    ["skipped_expired", null, "notSent"],
    ["failed", "delivery", "unknown"],
  ])("%s at stage %s -> %s", (status, failureStage, expected) => {
    expect(deliveryOf({ status, failureStage })).toBe(expected)
  })
})

describe("toGoogleAdsEventResource: options snapshot", () => {
  test("maps identity, provided time and consent statuses", () => {
    const resource = toGoogleAdsEventResource(
      row({ options: options({ timeSource: "provided" }) }),
    )

    expect(resource.identity).toEqual({ mode: "id", id: "A-1042" })
    expect(resource.conversionTimeProvided).toBe(true)
    expect(resource.consentSnapshot).toEqual({
      delivery: "sent",
      adUserData: "granted",
      adPersonalization: "denied",
    })
  })

  test("click identity has no id", () => {
    const resource = toGoogleAdsEventResource(
      row({
        options: options({
          identity: {
            version: 1,
            configuredPolicy: "click",
            effectivePolicy: "click",
            keySource: "click",
            id: null,
          },
        }),
      }),
    )

    expect(resource.identity).toEqual({ mode: "click", id: null })
    expect(resource.conversionTimeProvided).toBe(false)
  })

  test("a null status is notProvided", () => {
    const resource = toGoogleAdsEventResource(
      row({
        options: options({
          consent: {
            adUserData: { status: null, source: "notProvided" },
            adPersonalization: { status: null, source: "variable" },
          },
        }),
      }),
    )

    expect(resource.consentSnapshot).toMatchObject({
      adUserData: "notProvided",
      adPersonalization: "notProvided",
    })
  })

  test("legacy uploads never send ad personalization, whatever was configured", () => {
    const resource = toGoogleAdsEventResource(row({ uploadMethod: "legacy" }))

    expect(resource.consentSnapshot).toMatchObject({
      adUserData: "granted",
      adPersonalization: "notSupported",
    })
  })

  test("options null yields no identity and no consent snapshot", () => {
    const resource = toGoogleAdsEventResource(row({ options: null }))

    expect(resource.identity).toBeNull()
    expect(resource.consentSnapshot).toBeNull()
    expect(resource.conversionTimeProvided).toBe(false)
  })

  test.each([
    ["an unknown version", { version: 2 }],
    ["a malformed document", { version: 1, identity: "nope" }],
    ["a non-object", "garbage"],
  ])("%s is treated like no options without throwing", (_name, bad) => {
    const resource = toGoogleAdsEventResource(row({ options: bad }))

    expect(resource.identity).toBeNull()
    expect(resource.consentSnapshot).toBeNull()
    expect(resource.conversionTimeProvided).toBe(false)
  })
})

describe("toGoogleAdsEventResource: customer matching", () => {
  const v2 = (matching: unknown) =>
    options({
      version: 2,
      matching,
    } as unknown as Partial<GoogleAdsEventOptions>)

  test.each([
    [
      { status: "enabled", email: "{{email}}", phone: null },
      { status: "enabled", fields: ["email"] },
    ],
    [
      {
        status: "withheldConsent",
        email: "{{email}}",
        phone: "{{phone}}",
      },
      { status: "withheldConsent", fields: ["email", "phone"] },
    ],
    [
      {
        status: "unsupportedTransport",
        email: null,
        phone: "{{phone}}",
      },
      { status: "unsupportedTransport", fields: ["phone"] },
    ],
  ])("maps %j", (matching, expected) => {
    expect(
      toGoogleAdsEventResource(row({ options: v2(matching) })).customerMatching,
    ).toEqual(expected)
  })

  test("is null for v1 options, for options without matching and for no options", () => {
    expect(toGoogleAdsEventResource(row()).customerMatching).toBeNull()
    expect(
      toGoogleAdsEventResource(row({ options: v2(undefined) }))
        .customerMatching,
    ).toBeNull()
    expect(
      toGoogleAdsEventResource(row({ options: null })).customerMatching,
    ).toBeNull()
  })

  test("exposes which identifiers are configured, never the variable or any value", () => {
    const resource = toGoogleAdsEventResource(
      row({
        options: v2({
          status: "enabled",
          email: "{{secret_custom_field}}",
          phone: null,
        }),
      }),
    )

    expect(JSON.stringify(resource.customerMatching)).not.toContain("secret")
  })
})

describe("toGoogleAdsEventResource: error redaction", () => {
  const CLICK_ID = "Cj0KCQiAFULLCLICKIDxyz9"
  const TRANSACTION_ID = "gads-ws1-9f8e7d6c"
  const REQUEST_ID = "req-7c1a-4b2d"

  test.each([
    ["click id", CLICK_ID],
    ["transaction id", TRANSACTION_ID],
    ["request id", REQUEST_ID],
  ])("removes the %s from the error text", (_name, secret) => {
    const resource = toGoogleAdsEventResource(
      row({ error: `Google rejected ${secret} because it is stale` }),
    )

    expect(resource.error).toBe(
      "Google rejected [redacted] because it is stale",
    )
  })

  test("removes all three, repeated, from one error", () => {
    const resource = toGoogleAdsEventResource(
      row({
        error: `${CLICK_ID} / ${TRANSACTION_ID} / ${REQUEST_ID} / ${TRANSACTION_ID}`,
      }),
    )

    expect(resource.error).toBe(
      "[redacted] / [redacted] / [redacted] / [redacted]",
    )
    const wire = JSON.stringify(resource)
    for (const secret of [CLICK_ID, TRANSACTION_ID, REQUEST_ID]) {
      expect(wire).not.toContain(secret)
    }
  })

  test("an identifier that contains another is removed whole", () => {
    const resource = toGoogleAdsEventResource(
      row({
        clickId: "CLICKIDLONGENOUGH",
        transactionId: "tx-CLICKIDLONGENOUGH-suffix",
        error: "failed for tx-CLICKIDLONGENOUGH-suffix",
      }),
    )

    expect(resource.error).toBe("failed for [redacted]")
  })

  test("a row without a request id (never sent) redacts the others only", () => {
    const resource = toGoogleAdsEventResource(
      row({ requestId: null, error: `bad ${TRANSACTION_ID}` }),
    )

    expect(resource.error).toBe("bad [redacted]")
  })

  test("a null or empty error stays null", () => {
    expect(toGoogleAdsEventResource(row({ error: null })).error).toBeNull()
    expect(toGoogleAdsEventResource(row({ error: "" })).error).toBeNull()
  })

  test("never exposes the identifiers as properties, only the action id", () => {
    const resource = toGoogleAdsEventResource(row())

    expect(resource).not.toHaveProperty("transactionId")
    expect(resource).not.toHaveProperty("requestId")
    expect(resource).not.toHaveProperty("clickId")
    expect(resource.conversionActionId).toBe("7788")
  })
})

describe("toGoogleAdsEventResource: customer properties", () => {
  const v2 = (customerProperties: unknown) =>
    options({
      version: 2,
      customerProperties,
    } as unknown as Partial<GoogleAdsEventOptions>)

  test("maps the recorded snapshot", () => {
    const customerProperties = {
      status: "enabled",
      customerType: "NEW",
      customerValueBucket: null,
    }

    expect(
      toGoogleAdsEventResource(row({ options: v2(customerProperties) }))
        .customerProperties,
    ).toEqual(customerProperties)
  })

  test("is null for v1 options, for options without properties and for no options", () => {
    expect(toGoogleAdsEventResource(row()).customerProperties).toBeNull()
    expect(
      toGoogleAdsEventResource(row({ options: v2(undefined) }))
        .customerProperties,
    ).toBeNull()
    expect(
      toGoogleAdsEventResource(row({ options: null })).customerProperties,
    ).toBeNull()
  })
})
