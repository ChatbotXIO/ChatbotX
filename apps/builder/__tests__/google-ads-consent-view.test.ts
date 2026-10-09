import { NOT_PROVIDED_CONSENT } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { toConsentView } from "@/features/integration-google-ads/lib/to-consent-view"

describe("toConsentView", () => {
  test("absent maps to notProvided for both settings", () => {
    expect(
      toConsentView({ status: "absent", consent: NOT_PROVIDED_CONSENT }),
    ).toEqual({
      status: "absent",
      adUserData: { type: "notProvided", template: null },
      adPersonalization: { type: "notProvided", template: null },
    })
  })

  test.each([
    ["granted", { type: "granted" }, { type: "granted", template: null }],
    ["denied", { type: "denied" }, { type: "denied", template: null }],
    [
      "notProvided",
      { type: "notProvided" },
      { type: "notProvided", template: null },
    ],
    [
      "variable",
      { type: "variable", template: "{{gdpr}}" },
      { type: "variable", template: "{{gdpr}}" },
    ],
  ] as const)("ok maps a %s source and keeps the template only for variable", (_name, source, expected) => {
    expect(
      toConsentView({
        status: "ok",
        consent: { adUserData: source, adPersonalization: { type: "denied" } },
      }),
    ).toEqual({
      status: "ok",
      adUserData: expected,
      adPersonalization: { type: "denied", template: null },
    })
  })

  test("invalid carries no settings", () => {
    expect(toConsentView({ status: "invalid" })).toEqual({
      status: "invalid",
      adUserData: null,
      adPersonalization: null,
    })
  })
})
