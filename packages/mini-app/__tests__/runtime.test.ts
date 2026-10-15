// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON bindings are literally written as ${...}
// biome-ignore-all lint/suspicious/noThenProperty: `then` is the Flow JSON If branch key
import { describe, expect, it } from "vitest"
import type { MiniAppRuntimeScope } from "../src/expression"
import {
  resolveCompletePayload,
  resolveRenderedNodes,
  validateAnswer,
} from "../src/runtime"
import type { MiniAppNode } from "../src/types"
import { twoScreenDefinition } from "./fixtures"

const body = (id: string): MiniAppNode => ({
  id,
  type: "TextBody",
  props: { text: id },
})

const scope = (forms: Record<string, unknown>): MiniAppRuntimeScope => ({
  screenId: "S",
  forms: { S: forms },
})

const ids = (nodes: MiniAppNode[]) => nodes.map((node) => node.id)

describe("resolveRenderedNodes", () => {
  const nodes: MiniAppNode[] = [
    { ...body("hidden"), props: { text: "x", visible: "${form.show}" } },
    {
      id: "if",
      type: "If",
      props: { condition: "${form.age} >= 18" },
      slots: { then: [body("adult")], else: [body("minor")] },
    },
    {
      id: "switch",
      type: "Switch",
      props: { value: "${form.plan}" },
      slots: { basic: [body("basic")], pro: [body("pro")] },
    },
    {
      id: "form",
      type: "Form",
      props: { name: "f" },
      slots: { children: [body("inside")] },
    },
  ]

  it("picks branches, cases and visibility from the answers", () => {
    expect(
      ids(resolveRenderedNodes(nodes, scope({ age: 20, plan: "pro" }))),
    ).toEqual(["adult", "pro", "inside"])
    expect(
      ids(resolveRenderedNodes(nodes, scope({ age: 9, show: true }))),
    ).toEqual(["hidden", "minor", "inside"])
  })
})

describe("validateAnswer", () => {
  const input = (props: Record<string, unknown>): MiniAppNode => ({
    id: "n",
    type: "TextInput",
    props: { name: "x", label: "X", ...props },
  })

  it.each([
    [input({ required: true }), "", "required"],
    [input({ "input-type": "email" }), "nope", "invalidEmail"],
    [input({ "input-type": "date" }), "2024-13-01", "invalidFormat"],
    [input({ pattern: "^[0-9]+$" }), "abc", "invalidFormat"],
    [input({ "min-chars": 5 }), "abc", "tooShort"],
    [
      { id: "c", type: "CheckboxGroup", props: { "min-selected-items": 2 } },
      ["a"],
      "selectMore",
    ],
    [
      { id: "c", type: "CheckboxGroup", props: { "max-selected-items": 1 } },
      ["a", "b"],
      "selectFewer",
    ],
    [
      { id: "p", type: "PhotoPicker", props: { "min-uploaded-photos": 1 } },
      [],
      "uploadMore",
    ],
  ] as [
    MiniAppNode,
    unknown,
    string,
  ][])("reports %#: %s", (node, value, code) => {
    expect(validateAnswer(node, value)).toBe(code)
  })

  it("accepts a valid answer, an optional empty one and a broken pattern", () => {
    expect(validateAnswer(input({ "input-type": "email" }), "a@b.co")).toBe(
      undefined,
    )
    expect(validateAnswer(input({}), "")).toBe(undefined)
    expect(validateAnswer(input({ pattern: "(" }), "abc")).toBe(undefined)
  })
})

describe("resolveCompletePayload", () => {
  it("sends the answers of every screen on the way, skipping unanswered ones", () => {
    const definition = twoScreenDefinition()
    expect(
      resolveCompletePayload(definition, "s_confirm", {
        screenId: "CONFIRM",
        forms: { WELCOME: { full_name: "Ana" }, CONFIRM: {} },
      }),
    ).toEqual({ full_name: "Ana" })
  })
})
