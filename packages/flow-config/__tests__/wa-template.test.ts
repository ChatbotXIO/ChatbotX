import { describe, expect, test } from "vitest"
import {
  extractTemplateParams,
  isNamedTemplateToken,
  type TemplateComponent,
} from "../src/steps/send-wa-message-template"

// ─── isNamedTemplateToken ────────────────────────────────────────────────────
// Meta placeholders are positional ({{1}}) or named ({{order_id}}). A purely
// numeric token is positional; anything else is a named parameter that must be
// echoed back to Meta as `parameter_name` on every send-time parameter.

describe("isNamedTemplateToken", () => {
  test.each([
    ["1", false],
    ["2", false],
    ["12", false],
    ["user_name", true],
    ["order_id", true],
    ["first_name", true],
  ])("token %s → named=%s", (token, expected) => {
    expect(isNamedTemplateToken(token)).toBe(expected)
  })
})

// ─── extractTemplateParams — BODY ────────────────────────────────────────────

describe("extractTemplateParams BODY", () => {
  test("POSITIONAL — {{1}} {{2}} → two text params WITHOUT parameter_name", () => {
    const components: TemplateComponent[] = [
      { type: "BODY", text: "Hi {{1}} and {{2}}" },
    ]
    expect(extractTemplateParams(components).body).toEqual([
      { type: "text", text: "" },
      { type: "text", text: "" },
    ])
  })

  test("NAMED — single {{user_name}} → one text param WITH parameter_name", () => {
    const components: TemplateComponent[] = [
      { type: "BODY", text: "Happy Birthday, {{user_name}}!" },
    ]
    expect(extractTemplateParams(components).body).toEqual([
      { type: "text", text: "", parameter_name: "user_name" },
    ])
  })

  test("NAMED — multiple placeholders keep their own names", () => {
    const components: TemplateComponent[] = [
      { type: "BODY", text: "Hi {{first_name}}, order {{order_id}} is ready" },
    ]
    expect(extractTemplateParams(components).body).toEqual([
      { type: "text", text: "", parameter_name: "first_name" },
      { type: "text", text: "", parameter_name: "order_id" },
    ])
  })

  test("no variables → body stays undefined", () => {
    const components: TemplateComponent[] = [
      { type: "BODY", text: "Static body with no variables" },
    ]
    expect(extractTemplateParams(components).body).toBeUndefined()
  })
})

// ─── extractTemplateParams — HEADER TEXT ─────────────────────────────────────

describe("extractTemplateParams HEADER TEXT", () => {
  test("POSITIONAL — {{1}} → no parameter_name", () => {
    const components: TemplateComponent[] = [
      { type: "HEADER", format: "TEXT", text: "Order {{1}}" },
    ]
    expect(extractTemplateParams(components).header).toEqual([
      { type: "text", text: "" },
    ])
  })

  test("NAMED — {{store_name}} → parameter_name", () => {
    const components: TemplateComponent[] = [
      { type: "HEADER", format: "TEXT", text: "From {{store_name}}" },
    ]
    expect(extractTemplateParams(components).header).toEqual([
      { type: "text", text: "", parameter_name: "store_name" },
    ])
  })
})
