import { readFileSync } from "node:fs"
import {
  actionSteps,
  stepTypes,
  trackAdsLeadDefaultFn,
  trackAdsLeadSchema,
  trackAdsPurchaseDefaultFn,
  trackAdsPurchaseSchema,
} from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"

describe("trackAdsLead flow step registration", () => {
  test("defines the type and default state tuple", () => {
    const defaults = trackAdsLeadDefaultFn()
    expect(stepTypes.enum.trackAdsLead).toBe("trackAdsLead")
    expect(defaults.states).toHaveLength(2)
  })

  test("registers a valid value in the shared action union", () => {
    const value = trackAdsLeadDefaultFn()
    expect(trackAdsLeadSchema.safeParse(value).success).toBe(true)
    expect(actionSteps.some((schema) => schema.safeParse(value).success)).toBe(
      true,
    )
  })

  test("is wired into the builder step registry", () => {
    const source = readFileSync(
      "src/features/flows/react-flow/steps/index.tsx",
      "utf8",
    )
    expect(source).toContain(
      'import { trackAdsLeadStep } from "./track-ads-lead"',
    )
    expect(source).toContain("[stepTypes.enum.trackAdsLead]: trackAdsLeadStep")
  })

  // Palette grouping is covered in
  // `nodes/perform-action/__tests__/menu.test.ts` (the existing home for
  // `performActionMenus` coverage) — see "perform action ads conversions
  // menu" there.
})

describe("trackAdsPurchase flow step registration", () => {
  test("defines the type, static value/currency, and default state tuple", () => {
    const defaults = trackAdsPurchaseDefaultFn()
    expect(stepTypes.enum.trackAdsPurchase).toBe("trackAdsPurchase")
    expect(defaults.value).toBeUndefined()
    expect(defaults.currency).toBeUndefined()
    expect(defaults.states).toHaveLength(2)
  })

  test("registers a valid value in the shared action union", () => {
    const value = {
      ...trackAdsPurchaseDefaultFn(),
      value: "9.99",
      currency: "USD",
    }
    expect(trackAdsPurchaseSchema.safeParse(value).success).toBe(true)
    expect(actionSteps.some((schema) => schema.safeParse(value).success)).toBe(
      true,
    )
  })

  test("is wired into the builder step registry", () => {
    const source = readFileSync(
      "src/features/flows/react-flow/steps/index.tsx",
      "utf8",
    )
    expect(source).toContain(
      'import { trackAdsPurchaseStep } from "./track-ads-purchase"',
    )
    expect(source).toContain(
      "[stepTypes.enum.trackAdsPurchase]: trackAdsPurchaseStep",
    )
  })
})
