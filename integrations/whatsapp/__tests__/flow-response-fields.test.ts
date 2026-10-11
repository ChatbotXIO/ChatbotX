// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON references are literal `${...}` text
import { describe, expect, it } from "vitest"
import { parseFlowResponseFields } from "../src/api/flow"

const footer = (payload: Record<string, unknown>) => ({
  type: "Footer",
  label: "Done",
  "on-click-action": { name: "complete", payload },
})

const flowJson = (...screens: unknown[]) => ({ version: "7.3", screens })

const screen = (id: string, children: unknown[]) => ({
  id,
  title: id,
  terminal: true,
  layout: { type: "SingleColumnLayout", children },
})

describe("parseFlowResponseFields", () => {
  it("labels a key that matches the input's name (Mini App shape)", () => {
    const fields = parseFlowResponseFields(
      flowJson(
        screen("WELCOME", [
          { type: "TextInput", name: "text_input", label: "Full name" },
          footer({ text_input: "${form.text_input}" }),
        ]),
      ),
    )

    expect(fields).toEqual([
      { key: "text_input", label: "Full name", options: {}, labelled: true },
    ])
  })

  it("traces a renamed key through its ${form.X} reference", () => {
    const fields = parseFlowResponseFields(
      flowJson(
        screen("WELCOME", [
          { type: "TextInput", name: "name_input", label: "Họ tên" },
          footer({ ho_ten: "${form.name_input}" }),
        ]),
      ),
    )

    expect(fields[0]).toMatchObject({
      key: "ho_ten",
      label: "Họ tên",
      labelled: true,
    })
  })

  it("traces a ${screen.S.form.X} reference to an earlier screen", () => {
    const fields = parseFlowResponseFields(
      flowJson(
        screen("FIRST", [
          {
            type: "Form",
            name: "form",
            children: [
              { type: "TextInput", name: "phone", label: "Phone number" },
            ],
          },
        ]),
        screen("LAST", [
          footer({ customer_phone: "${screen.FIRST.form.phone}" }),
        ]),
      ),
    )

    expect(fields).toEqual([
      {
        key: "customer_phone",
        label: "Phone number",
        options: {},
        labelled: true,
      },
    ])
  })

  it("labels each answer from the screen it names when names repeat", () => {
    const fields = parseFlowResponseFields(
      flowJson(
        screen("FIRST", [
          { type: "TextInput", name: "note", label: "Note about you" },
          {
            type: "Footer",
            label: "Next",
            "on-click-action": {
              name: "navigate",
              next: { type: "screen", name: "LAST" },
              payload: {},
            },
          },
        ]),
        screen("LAST", [
          { type: "TextInput", name: "note", label: "Note for delivery" },
          footer({
            about: "${screen.FIRST.form.note}",
            delivery: "${form.note}",
            LAST: "${data.unused}",
          }),
        ]),
      ),
    )

    expect(fields.map((field) => [field.key, field.label])).toEqual([
      ["about", "Note about you"],
      ["delivery", "Note for delivery"],
      // A navigate target named like a key is not an input.
      ["LAST", "LAST"],
    ])
  })

  it("does not borrow another screen's label for a dynamic one", () => {
    const fields = parseFlowResponseFields(
      flowJson(
        screen("FIRST", [
          { type: "TextInput", name: "city", label: "Billing city" },
        ]),
        screen("LAST", [
          { type: "TextInput", name: "city", label: "${data.city_label}" },
          footer({ shipping_city: "${form.city}" }),
        ]),
      ),
    )

    expect(fields[0]).toMatchObject({
      label: "Shipping city",
      labelled: false,
    })
  })

  it("reads static option titles and skips dynamic ones", () => {
    const fields = parseFlowResponseFields(
      flowJson(
        screen("WELCOME", [
          {
            type: "Dropdown",
            name: "plan",
            label: "Plan",
            "data-source": [
              { id: "0_basic", title: "Basic" },
              { id: "1_pro", title: "Pro" },
            ],
          },
          {
            type: "RadioButtonsGroup",
            name: "slot",
            label: "Slot",
            "data-source": "${data.slots}",
          },
          footer({ plan: "${form.plan}", slot: "${form.slot}" }),
        ]),
      ),
    )

    expect(fields).toEqual([
      {
        key: "plan",
        label: "Plan",
        options: { "0_basic": "Basic", "1_pro": "Pro" },
        labelled: true,
      },
      { key: "slot", label: "Slot", options: {}, labelled: true },
    ])
  })

  it("humanizes keys with no component or a dynamic label", () => {
    const fields = parseFlowResponseFields(
      flowJson(
        screen("WELCOME", [
          { type: "TextInput", name: "city", label: "${data.city_label}" },
          footer({
            city: "${form.city}",
            source_channel: "${data.channel}",
            campaign: "spring",
          }),
        ]),
      ),
    )

    expect(
      fields.map((field) => [field.key, field.label, field.labelled]),
    ).toEqual([
      ["city", "City", false],
      ["source_channel", "Source channel", false],
      ["campaign", "Campaign", false],
    ])
  })

  it("returns no fields for an endpoint Flow with no complete payload", () => {
    expect(
      parseFlowResponseFields(
        flowJson(
          screen("WELCOME", [
            { type: "TextInput", name: "email", label: "Email" },
            {
              type: "Footer",
              label: "Next",
              "on-click-action": { name: "data_exchange", payload: {} },
            },
          ]),
        ),
      ),
    ).toEqual([])
  })

  it.each([
    ["null", null],
    ["no screens", { version: "7.3" }],
    ["a string", "not json"],
  ])("returns no fields for %s", (_label, json) => {
    expect(parseFlowResponseFields(json)).toEqual([])
  })
})
