import type { GoogleAdsConsent } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  consentForTransport,
  consentTemplatesOf,
  googleAdsConsentInputSchema,
  toConsentInput,
} from "../src/google-ads/consent"

const variable = (template: string) => ({ type: "variable", template }) as const

const consentWith = (
  adUserData: GoogleAdsConsent["adUserData"],
  adPersonalization: GoogleAdsConsent["adPersonalization"] = {
    type: "notProvided",
  },
): GoogleAdsConsent => ({ adUserData, adPersonalization })

describe("toConsentInput", () => {
  test.each([
    ["Granted", "granted"],
    [" DENIED ", "denied"],
    ["granted", "granted"],
  ] as const)("variable %j resolves to %s", (raw, status) => {
    const result = toConsentInput(consentWith(variable("{{a}}")), {
      adUserData: raw,
    })

    expect(result).toEqual({
      ok: true,
      consent: {
        adUserData: { status, source: "variable" },
        adPersonalization: { status: null, source: "notProvided" },
      },
    })
  })

  test.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["unresolved", "{{x}}"],
    ["partially unresolved", "granted {{x}}"],
    ["missing", undefined],
  ])("variable %s is omitted", (_name, raw) => {
    const result = toConsentInput(consentWith(variable("{{a}}")), {
      adUserData: raw,
    })

    expect(result).toMatchObject({
      ok: true,
      consent: { adUserData: { status: null, source: "variable" } },
    })
  })

  test("a value that is not granted or denied fails naming the setting", () => {
    const result = toConsentInput(consentWith(variable("{{a}}")), {
      adUserData: "yes",
    })

    expect(result).toEqual({ ok: false, setting: "adUserData" })
  })

  test("fixed and not-provided sources ignore resolved values", () => {
    const result = toConsentInput(
      consentWith({ type: "granted" }, { type: "denied" }),
      { adUserData: "denied" },
    )

    expect(result).toEqual({
      ok: true,
      consent: {
        adUserData: { status: "granted", source: "fixed" },
        adPersonalization: { status: "denied", source: "fixed" },
      },
    })
    expect(
      toConsentInput(consentWith({ type: "notProvided" }), {}),
    ).toMatchObject({
      ok: true,
      consent: { adUserData: { status: null, source: "notProvided" } },
    })
  })

  test("names adPersonalization when only the second setting is bad", () => {
    const result = toConsentInput(
      consentWith(variable("{{a}}"), variable("{{b}}")),
      { adUserData: "granted", adPersonalization: "maybe" },
    )

    expect(result).toEqual({ ok: false, setting: "adPersonalization" })
  })

  test("the failure never carries the raw value", () => {
    const result = toConsentInput(consentWith(variable("{{a}}")), {
      adUserData: "SECRET-raw-value",
    })

    expect(JSON.stringify(result)).not.toContain("SECRET-raw-value")
  })

  test("a successful result parses with the consent input schema", () => {
    const result = toConsentInput(consentWith(variable("{{a}}")), {
      adUserData: "granted",
    })

    expect(
      result.ok && googleAdsConsentInputSchema.safeParse(result.consent),
    ).toMatchObject({ success: true })
  })
})

describe("consentTemplatesOf", () => {
  test("returns only the variable templates", () => {
    expect(
      consentTemplatesOf(consentWith({ type: "granted" }, variable("{{b}}"))),
    ).toEqual({ adPersonalization: "{{b}}" })
  })

  test("returns an empty object when nothing is variable", () => {
    expect(
      consentTemplatesOf(consentWith({ type: "granted" }, { type: "denied" })),
    ).toEqual({})
  })
})

describe("consentForTransport", () => {
  const entry = (status: "granted" | "denied" | null) => ({
    status,
    source: status === null ? ("notProvided" as const) : ("fixed" as const),
  })
  const input = (
    adUserData: "granted" | "denied" | null,
    adPersonalization: "granted" | "denied" | null,
  ) => ({
    adUserData: entry(adUserData),
    adPersonalization: entry(adPersonalization),
  })

  test.each([
    [
      "granted",
      "denied",
      { adUserData: "granted", adPersonalization: "denied" },
      {},
    ],
    ["denied", null, { adUserData: "denied" }, {}],
    [null, "granted", { adPersonalization: "granted" }, {}],
    [null, null, {}, {}],
  ] as const)("Data Manager sends both settings (%s, %s)", (userData, personalization, sent, withheld) => {
    expect(
      consentForTransport(input(userData, personalization), "dataManager"),
    ).toEqual({ sent, withheld })
  })

  test.each([
    [
      "granted",
      "denied",
      { adUserData: "granted" },
      { adPersonalization: "denied" },
    ],
    [
      "denied",
      "granted",
      { adUserData: "denied" },
      { adPersonalization: "granted" },
    ],
    ["granted", null, { adUserData: "granted" }, {}],
    [null, "denied", {}, { adPersonalization: "denied" }],
    [null, null, {}, {}],
  ] as const)("legacy sends ad user data only and withholds ad personalization (%s, %s)", (userData, personalization, sent, withheld) => {
    expect(
      consentForTransport(input(userData, personalization), "legacy"),
    ).toEqual({ sent, withheld })
  })
})
