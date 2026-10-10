import { describe, expect, it } from "vitest"
import {
  buildCustomerPropertiesSnapshot,
  parseCustomerProperties,
  userPropertiesOf,
} from "../src/google-ads/customer-properties"

describe("parseCustomerProperties", () => {
  it("treats absent, blank and unresolved values as not set", () => {
    expect(parseCustomerProperties({})).toEqual({
      ok: true,
      value: { customerType: null, customerValueBucket: null },
    })
    expect(
      parseCustomerProperties({
        customerType: "  ",
        customerValueBucket: "{{contact.tier}}",
      }),
    ).toEqual({
      ok: true,
      value: { customerType: null, customerValueBucket: null },
    })
  })

  it("accepts the allowed values case-insensitively", () => {
    expect(
      parseCustomerProperties({
        customerType: " returning ",
        customerValueBucket: "High",
      }),
    ).toEqual({
      ok: true,
      value: { customerType: "RETURNING", customerValueBucket: "HIGH" },
    })
  })

  it.each([
    { customerType: "VIP" },
    { customerType: "REENGAGED" },
    { customerValueBucket: "GOLD" },
    { customerType: "NEW", customerValueBucket: "5" },
  ])("rejects a set value outside the allowed ones: %j", (input) => {
    expect(parseCustomerProperties(input)).toEqual({ ok: false })
  })
})

describe("buildCustomerPropertiesSnapshot", () => {
  const parsed = { customerType: "NEW", customerValueBucket: null } as const

  it("records nothing when no property is set", () => {
    expect(
      buildCustomerPropertiesSnapshot({
        parsed: { customerType: null, customerValueBucket: null },
        adUserDataStatus: "granted",
        uploadMethod: "dataManager",
      }),
    ).toBeUndefined()
  })

  it("is enabled only with granted consent on Data Manager", () => {
    expect(
      buildCustomerPropertiesSnapshot({
        parsed,
        adUserDataStatus: "granted",
        uploadMethod: "dataManager",
      }),
    ).toEqual({ status: "enabled", ...parsed })
  })

  it.each([
    "denied",
    null,
  ] as const)("withholds when adUserData is %s", (adUserDataStatus) => {
    expect(
      buildCustomerPropertiesSnapshot({
        parsed,
        adUserDataStatus,
        uploadMethod: "dataManager",
      })?.status,
    ).toBe("withheldConsent")
  })

  it("is unsupported on the legacy transport whatever the consent", () => {
    expect(
      buildCustomerPropertiesSnapshot({
        parsed,
        adUserDataStatus: "granted",
        uploadMethod: "legacy",
      })?.status,
    ).toBe("unsupportedTransport")
  })
})

describe("userPropertiesOf", () => {
  it("sends only the set properties of an enabled snapshot", () => {
    expect(
      userPropertiesOf({
        status: "enabled",
        customerType: null,
        customerValueBucket: "LOW",
      }),
    ).toEqual({ customerValueBucket: "LOW" })
  })

  it.each([
    "withheldConsent",
    "unsupportedTransport",
  ] as const)("sends nothing for %s", (status) => {
    expect(
      userPropertiesOf({
        status,
        customerType: "NEW",
        customerValueBucket: "HIGH",
      }),
    ).toBeUndefined()
  })

  it("sends nothing without a snapshot", () => {
    expect(userPropertiesOf(undefined)).toBeUndefined()
  })
})
