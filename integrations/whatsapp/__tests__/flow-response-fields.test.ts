// biome-ignore-all lint/suspicious/noTemplateCurlyInString: Flow JSON references are literal `${...}` text
// biome-ignore-all lint/suspicious/noThenProperty: `then` is the Flow JSON If branch key
import { describe, expect, it } from "vitest"
import { parseFlowResponseFields, parseFlowScreens } from "../src/api/flow"

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
      {
        key: "text_input",
        label: "Full name",
        options: {},
        labelled: true,
      },
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
      {
        key: "slot",
        label: "Slot",
        options: {},
        labelled: true,
      },
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

describe("file answers", () => {
  /** Each output of the first screen (which reaches every later one), with its kind. */
  const kindsOf = (flow: unknown) =>
    parseFlowScreens(flow)[0]?.output.map((output) => [
      output.value,
      output.kind,
    ])

  const photoFlow = () =>
    flowJson(
      screen("UPLOAD", [
        { type: "PhotoPicker", name: "photo_picker", label: "Photos" },
        { type: "TextInput", name: "name_input", label: "Name" },
        footer({
          photo_picker: "${form.photo_picker}",
          full_name: "${form.name_input}",
        }),
      ]),
    )

  it("tags the key of a PhotoPicker or DocumentPicker as a file", () => {
    expect(
      kindsOf(
        flowJson(
          screen("UPLOAD", [
            { type: "DocumentPicker", name: "doc_input", label: "ID card" },
            footer({ id_card: "${form.doc_input}" }),
          ]),
        ),
      ),
    ).toEqual([["id_card", "file"]])
  })

  it("tags every other key as a value", () => {
    expect(kindsOf(photoFlow())).toEqual([
      ["photo_picker", "file"],
      ["full_name", "value"],
    ])
  })

  it("follows a reference to a picker on an earlier screen", () => {
    expect(
      kindsOf(
        flowJson(
          screen("UPLOAD", [
            { type: "PhotoPicker", name: "photos", label: "Photos" },
            {
              type: "Footer",
              label: "Next",
              "on-click-action": {
                name: "navigate",
                next: { type: "screen", name: "DONE" },
                payload: {},
              },
            },
          ]),
          screen("DONE", [footer({ receipt: "${screen.UPLOAD.form.photos}" })]),
        ),
      ),
    ).toEqual([["receipt", "file"]])
  })

  it("marks a literal or data payload value as a value", () => {
    expect(
      kindsOf(
        flowJson(
          screen("UPLOAD", [
            { type: "PhotoPicker", name: "photos", label: "Photos" },
            footer({ source: "web", from_data: "${data.photos}" }),
          ]),
        ),
      ),
    ).toEqual([
      ["source", "value"],
      ["from_data", "value"],
    ])
  })

  it("exposes the kind on the outputs of each screen", () => {
    expect(parseFlowScreens(photoFlow())[0]?.output).toEqual([
      { value: "photo_picker", label: "Photos", kind: "file" },
      { value: "full_name", label: "Full name", kind: "value" },
    ])
  })

  it("does not call a literal answer a file because an input of that name is a picker", () => {
    const flow = flowJson(
      screen("UPLOAD", [
        { type: "PhotoPicker", name: "photos", label: "Photos" },
        footer({ photos: "none" }),
      ]),
    )

    expect(parseFlowScreens(flow)[0]?.output).toEqual([
      { value: "photos", label: "Photos", kind: "value" },
    ])
  })

  it("keeps a key that two screens fill differently apart, per screen", () => {
    const flow = flowJson(
      screen("TEXT_PATH", [
        { type: "TextInput", name: "note", label: "Note" },
        footer({ answer: "${form.note}" }),
      ]),
      screen("DOCUMENT_PATH", [
        { type: "DocumentPicker", name: "doc", label: "Document" },
        footer({ answer: "${form.doc}" }),
      ]),
    )

    const outputs = Object.fromEntries(
      parseFlowScreens(flow).map((item) => [item.id, item.output]),
    )

    expect(outputs.TEXT_PATH?.map((output) => output.kind)).toEqual(["value"])
    expect(outputs.DOCUMENT_PATH?.map((output) => output.kind)).toEqual([
      "file",
    ])
  })

  it("a key two branches from one start fill differently is a file answer", () => {
    const navigateTo = (next: string) => ({
      type: "Footer",
      label: next,
      "on-click-action": {
        name: "navigate",
        next: { type: "screen", name: next },
        payload: {},
      },
    })
    const flow = flowJson(
      {
        id: "START",
        title: "START",
        layout: {
          type: "SingleColumnLayout",
          children: [navigateTo("DOCS"), navigateTo("TEXT")],
        },
      },
      screen("DOCS", [
        { type: "DocumentPicker", name: "doc", label: "Document" },
        footer({ answer: "${form.doc}" }),
      ]),
      screen("TEXT", [
        { type: "TextInput", name: "note", label: "Note" },
        footer({ answer: "${form.note}" }),
      ]),
    )

    const start = parseFlowScreens(flow).find((item) => item.id === "START")

    expect(start?.output.map((output) => [output.value, output.kind])).toEqual([
      ["answer", "file"],
    ])
  })

  it("a key the branches of one screen fill differently is a file answer", () => {
    const flow = flowJson(
      screen("UPLOAD", [
        { type: "TextInput", name: "note", label: "Note" },
        { type: "DocumentPicker", name: "doc", label: "Document" },
        {
          type: "If",
          condition: "${form.note} != ''",
          then: [footer({ answer: "${form.note}" })],
          else: [footer({ answer: "${form.doc}" })],
        },
      ]),
    )

    expect(
      parseFlowScreens(flow)[0]?.output.map((output) => output.kind),
    ).toEqual(["file"])
  })
})
