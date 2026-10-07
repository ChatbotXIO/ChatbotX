// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON bindings are literally written as ${...}
import { describe, expect, it } from "vitest"
import {
  evaluateExpression,
  extractReferences,
  interpolate,
  isValidExpression,
  type MiniAppRuntimeScope,
} from "../src/expression"

const scope: MiniAppRuntimeScope = {
  screenId: "DETAILS",
  forms: {
    WELCOME: { name: "Ana", age: "21", plan: "pro" },
    DETAILS: { agree: true, topics: ["a", "b"], empty: [] },
  },
}

describe("evaluateExpression", () => {
  it("compares references to literals", () => {
    expect(evaluateExpression("${screen.WELCOME.form.age} >= 18", scope)).toBe(
      true,
    )
    expect(
      evaluateExpression("${screen.WELCOME.form.plan} == 'pro'", scope),
    ).toBe(true)
    expect(
      evaluateExpression('${screen.WELCOME.form.plan} != "pro"', scope),
    ).toBe(false)
  })

  it("resolves form.x against the current screen", () => {
    expect(evaluateExpression("${form.agree}", scope)).toBe(true)
    expect(evaluateExpression("!${form.agree}", scope)).toBe(false)
  })

  it("respects precedence and parentheses", () => {
    expect(evaluateExpression("false || true && false", scope)).toBe(false)
    expect(evaluateExpression("(false || true) && true", scope)).toBe(true)
  })

  it("treats empty arrays as falsy", () => {
    expect(evaluateExpression("${form.topics} && !${form.empty}", scope)).toBe(
      true,
    )
  })

  it("handles negative numbers and backtick-wrapped expressions", () => {
    expect(evaluateExpression("`-1 < 0`", scope)).toBe(true)
  })

  it("returns undefined for invalid input instead of throwing", () => {
    expect(evaluateExpression("${form.a} ==", scope)).toBeUndefined()
    expect(evaluateExpression("alert(1)", scope)).toBeUndefined()
    expect(isValidExpression("(${form.a} == 1")).toBe(false)
    expect(isValidExpression("${form.a} == 1")).toBe(true)
  })
})

describe("interpolate", () => {
  it("replaces references inside plain text", () => {
    expect(interpolate("Hi ${screen.WELCOME.form.name}!", scope)).toBe(
      "Hi Ana!",
    )
    expect(interpolate("Topics: ${form.topics}", scope)).toBe("Topics: a, b")
  })

  it("concatenates nested backtick expressions", () => {
    expect(interpolate("`'Hello ' ${screen.WELCOME.form.name}`", scope)).toBe(
      "Hello Ana",
    )
  })

  it("leaves unknown references as empty text", () => {
    expect(interpolate("[${form.missing}]", scope)).toBe("[]")
  })
})

describe("extractReferences", () => {
  it("parses local, global and invalid references", () => {
    const refs = extractReferences(
      "${form.a} ${screen.X.form.b} ${data.c} ${oops}",
    )
    expect(refs.map((ref) => ref.reference?.source ?? null)).toEqual([
      "form",
      "form",
      "data",
      null,
    ])
    expect(refs[1]?.reference?.screenId).toBe("X")
  })
})
