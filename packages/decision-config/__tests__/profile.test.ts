import { describe, expect, test } from "vitest"
import { globalRouterConfigSchema } from "../src"

const fallback = { id: "1", type: "flow" } as const

describe("globalRouterConfigSchema", () => {
  test("accepts tagged destinations and Noul defaults", () => {
    expect(globalRouterConfigSchema.safeParse({ fallback }).success).toBe(true)
  })

  test("rejects overlapping score routes and invalid Noul bands", () => {
    expect(
      globalRouterConfigSchema.safeParse({
        fallback,
        noul: { falseMaximum: 0.8, trueMinimum: 0.2 },
      }).success,
    ).toBe(false)
    expect(
      globalRouterConfigSchema.safeParse({
        fallback,
        routes: [
          { destination: fallback, from: 1, to: 2, type: "score" },
          { destination: fallback, from: 2, to: 3, type: "score" },
        ],
      }).success,
    ).toBe(false)
  })

  test("rejects conflicting Choice/Noul routes and result mappings", () => {
    expect(
      globalRouterConfigSchema.safeParse({
        fallback,
        routes: [
          { destination: fallback, type: "choice", value: "buy" },
          { destination: fallback, type: "choice", value: "buy" },
        ],
      }).success,
    ).toBe(false)
    expect(
      globalRouterConfigSchema.safeParse({
        fallback,
        routes: [
          { destination: fallback, type: "noul", value: true },
          { destination: fallback, type: "noul", value: true },
        ],
      }).success,
    ).toBe(false)
    expect(
      globalRouterConfigSchema.safeParse({
        fallback,
        metadataMappings: [
          {
            customFieldId: "1",
            customFieldType: "number",
            value: "confidence",
          },
          {
            customFieldId: "2",
            customFieldType: "number",
            value: "confidence",
          },
        ],
      }).success,
    ).toBe(false)
  })
})
