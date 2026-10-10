import { describe, expect, it } from "vitest"
import {
  applyCustomFieldMappings,
  collectCustomFieldMappings,
  formatAnswerForCustomField,
} from "../src/custom-fields"
import { toFlowJson } from "../src/serialize"
import { twoScreenDefinition } from "./fixtures"

describe("custom field mappings", () => {
  it("are collected by input name and never reach Flow JSON", () => {
    const definition = applyCustomFieldMappings(twoScreenDefinition(), {
      full_name: "cf-1",
    })
    expect(collectCustomFieldMappings(definition)).toEqual({
      full_name: "cf-1",
    })
    expect(JSON.stringify(toFlowJson(definition))).not.toContain("cf-1")
  })

  it("can be cleared, and ignore unknown names", () => {
    const mapped = applyCustomFieldMappings(twoScreenDefinition(), {
      full_name: "cf-1",
      nope: "cf-2",
    })
    expect(
      collectCustomFieldMappings(
        applyCustomFieldMappings(mapped, { full_name: null }),
      ),
    ).toEqual({})
  })
})

describe("formatAnswerForCustomField", () => {
  it("formats each answer shape", () => {
    expect(formatAnswerForCustomField("Ana")).toBe("Ana")
    expect(formatAnswerForCustomField(true)).toBe("true")
    expect(formatAnswerForCustomField(["a", "b"])).toBe("a, b")
    expect(
      formatAnswerForCustomField({
        "start-date": "2026-01-01",
        "end-date": "2026-01-03",
      }),
    ).toBe("2026-01-01 - 2026-01-03")
    expect(formatAnswerForCustomField([])).toBeNull()
    expect(formatAnswerForCustomField("")).toBeNull()
  })
})
