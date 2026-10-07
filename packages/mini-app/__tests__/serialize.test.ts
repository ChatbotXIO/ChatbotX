// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON bindings are literally written as ${...}
// biome-ignore-all lint/suspicious/noThenProperty: `then` is the Flow JSON If branch key
import { describe, expect, it } from "vitest"
import { locateIssues } from "../src/issue-location"
import {
  fromFlowJson,
  MiniAppImportError,
  toFlowJson,
  toNestedExpression,
} from "../src/serialize"
import type { FlowJson } from "../src/types"
import { validateMiniApp } from "../src/validate"
import { twoScreenDefinition, twoScreenFlowJson } from "./fixtures"

const UNSUPPORTED_ACTION = /unsupported_action/
const UNKNOWN_SCREEN = /unknown_screen/

describe("toFlowJson", () => {
  it("produces Meta Flow JSON with generated payloads and no editor ids", () => {
    expect(toFlowJson(twoScreenDefinition())).toEqual(twoScreenFlowJson)
  })

  it("serializes containers into Meta's slot properties", () => {
    const definition = twoScreenDefinition()
    definition.screens[0]?.children.splice(1, 0, {
      id: "n_if",
      type: "If",
      props: { condition: "${form.full_name} == 'x'" },
      slots: {
        then: [{ id: "n_t", type: "TextBody", props: { text: "yes" } }],
        else: [],
      },
    })
    const json = toFlowJson(definition)
    const ifComponent = json.screens[0]?.layout.children[1]
    expect(ifComponent).toEqual({
      type: "If",
      condition: "${form.full_name} == 'x'",
      then: [{ type: "TextBody", text: "yes" }],
    })
  })

  it("only puts inputs from screens on the path into a complete payload", () => {
    const definition = twoScreenDefinition()
    definition.screens.push({
      key: "s_orphan",
      id: "ORPHAN",
      title: "",
      terminal: false,
      children: [
        {
          id: "n_o",
          type: "TextInput",
          props: { name: "orphan", label: "Orphan" },
        },
      ],
    })
    const footer = toFlowJson(definition).screens[1]?.layout.children[2]
    expect(footer?.["on-click-action"]).toMatchObject({
      payload: {
        full_name: "${screen.WELCOME.form.full_name}",
        terms: "${form.terms}",
      },
    })
  })
})

describe("fromFlowJson", () => {
  it("round-trips Flow JSON produced by toFlowJson", () => {
    const imported = fromFlowJson(twoScreenFlowJson as FlowJson)
    expect(toFlowJson(imported)).toEqual(twoScreenFlowJson)
  })

  it("rejects endpoint-powered flows and unsupported actions", () => {
    expect(() =>
      fromFlowJson({
        ...(twoScreenFlowJson as FlowJson),
        data_api_version: "3.0",
      }),
    ).toThrow(MiniAppImportError)

    const withExchange = structuredClone(twoScreenFlowJson) as FlowJson
    const footer = withExchange.screens[0]?.layout.children[2] as Record<
      string,
      unknown
    >
    footer["on-click-action"] = { name: "data_exchange", payload: {} }
    expect(() => fromFlowJson(withExchange)).toThrow(UNSUPPORTED_ACTION)
  })

  it("rejects navigation to unknown screens", () => {
    const broken = structuredClone(twoScreenFlowJson) as FlowJson
    const footer = broken.screens[0]?.layout.children[2] as Record<
      string,
      unknown
    >
    footer["on-click-action"] = {
      name: "navigate",
      next: { type: "screen", name: "NOPE" },
    }
    expect(() => fromFlowJson(broken)).toThrow(UNKNOWN_SCREEN)
  })
})

describe("locateIssues", () => {
  it("maps editor ids to Flow JSON paths", () => {
    const definition = fromFlowJson(twoScreenFlowJson as FlowJson)
    const input = definition.screens[0]?.children[1]
    if (input) {
      input.props.label = "This label is far too long for Meta"
    }
    const [issue] = locateIssues(definition, validateMiniApp(definition).issues)
    expect(issue).toMatchObject({
      code: "property_too_long",
      screenId: "WELCOME",
      path: "screens[0].layout.children[1]",
      property: "label",
    })
  })
})

describe("toNestedExpression", () => {
  it("wraps text mixed with references, escaping quotes", () => {
    expect(toNestedExpression("Hi ${form.name}, it's ${form.day}!")).toBe(
      "`'Hi ' ${form.name} ', it\\'s ' ${form.day} '!'`",
    )
  })

  it("leaves plain text, whole references and nested expressions alone", () => {
    expect(toNestedExpression("Plain")).toBe("Plain")
    expect(toNestedExpression("${form.name}")).toBe("${form.name}")
    expect(toNestedExpression("`'a' ${form.b}`")).toBe("`'a' ${form.b}`")
  })

  it("keeps If conditions as written", () => {
    const definition = twoScreenDefinition()
    definition.screens[0]?.children.splice(1, 0, {
      id: "n_if",
      type: "If",
      props: { condition: "${form.full_name} == 'x'" },
      slots: {
        then: [
          {
            id: "n_t",
            type: "TextBody",
            props: { text: "Hi ${form.full_name}" },
          },
        ],
        else: [],
      },
    })
    const ifJson = toFlowJson(definition).screens[0]?.layout
      .children[1] as unknown as {
      condition: string
      then: { text: string }[]
    }
    expect(ifJson.condition).toBe("${form.full_name} == 'x'")
    expect(ifJson.then[0]?.text).toBe("`'Hi ' ${form.full_name}`")
  })
})
