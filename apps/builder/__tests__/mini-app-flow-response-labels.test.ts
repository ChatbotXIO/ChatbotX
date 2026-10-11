// @vitest-environment node

import { parseFlowResponseFields } from "@chatbotx.io/integration-whatsapp/api/flow"
import {
  createNode,
  createStarterDefinition,
  toFlowJson,
} from "@chatbotx.io/mini-app"
import { describe, expect, test } from "vitest"
import { buildWhatsappFlowResponseFields } from "@/features/messages/lib/build-whatsapp-flow-response-fields"

// A Mini App is published to Meta as its exported Flow JSON, so the inbox's
// "View response" labels come from exactly this JSON. Pin that the export and
// the label parser agree, so a change to either side fails here.
const miniAppFlowJson = () => {
  const definition = createStarterDefinition("Welcome")
  const screen = definition.screens[0]
  if (!screen) {
    throw new Error("starter has no screen")
  }
  const footer = screen.children.pop()
  if (!footer) {
    throw new Error("starter has no footer")
  }
  const names = new Set<string>()
  for (const type of [
    "TextInput",
    "Dropdown",
    "CheckboxGroup",
    "OptIn",
    "DatePicker",
  ] as const) {
    screen.children.push(createNode(type, names))
  }
  screen.children.push(footer)
  return toFlowJson(definition)
}

describe("Mini App Flow JSON → response labels", () => {
  test("every Mini App input is labelled, with its option titles", () => {
    const labels = parseFlowResponseFields(miniAppFlowJson())

    expect(labels.map((label) => [label.key, label.labelled])).toEqual([
      ["text_input_1", true],
      ["dropdown_1", true],
      ["checkbox_group_1", true],
      ["opt_in_1", true],
      ["date_picker_1", true],
    ])
    expect(
      labels.find((label) => label.key === "dropdown_1")?.options,
    ).toMatchObject({ option_1: "Option 1" })
  })

  test("a WhatsApp answer to that Mini App reads like the form", () => {
    const labels = parseFlowResponseFields(miniAppFlowJson())

    const { fields, labelSource } = buildWhatsappFlowResponseFields(
      {
        flow_token: "tok",
        text_input_1: "An",
        dropdown_1: "option_2",
        checkbox_group_1: ["option_1", "option_2"],
        opt_in_1: true,
        date_picker_1: "2026-10-11",
      },
      labels,
    )

    expect(labelSource).toBe("whatsappFlow")
    expect(fields.map(({ kind, value }) => [kind, value])).toEqual([
      ["text", "An"],
      ["text", "Option 2"],
      ["list", ["Option 1", "Option 2"]],
      ["boolean", true],
      ["text", "2026-10-11"],
    ])
  })
})
