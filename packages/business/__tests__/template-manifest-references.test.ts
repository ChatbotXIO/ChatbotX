// @vitest-environment node
import { describe, expect, test } from "vitest"
import {
  collectManifestReferences,
  customFieldNameFromToken,
} from "../src/template/manifest-references"

const flowEntry = (steps: Record<string, unknown>[]) => ({
  sourceId: "flow-1",
  nodes: [{ id: "n1", data: { details: { steps } } }],
  edges: [],
})

describe("collectManifestReferences", () => {
  test("finds a tag a trigger action uses even when no tag was selected (E1)", () => {
    const references = collectManifestReferences([
      {
        sourceId: "trigger-1",
        actions: [{ actionType: "addTag", tagIds: ["678679"] }],
      },
    ])

    expect([...references.tagIds]).toEqual(["678679"])
  })

  test("finds custom fields from id slots and ignores system-field slugs", () => {
    const references = collectManifestReferences([
      flowEntry([
        { id: "s1", stepType: "setCustomField", inputFieldId: "12345" },
        { id: "s2", stepType: "setCustomField", inputFieldId: "first_name" },
      ]),
    ])

    expect([...references.customFieldIds]).toEqual(["12345"])
  })

  test("a third-party tag list is not a tag reference", () => {
    const references = collectManifestReferences([
      flowEntry([
        { id: "s1", stepType: "activeCampaignSyncContact", tagIds: ["1"] },
      ]),
    ])

    expect(references.tagIds.size).toBe(0)
  })

  test("reads tag ids held in a Condition value", () => {
    const references = collectManifestReferences([
      {
        sourceId: "trigger-1",
        conditions: [{ field: "tags", operator: "in", value: ["11", "12"] }],
      },
    ])

    expect([...references.tagIds].sort()).toEqual(["11", "12"])
  })

  test("finds custom-field names used as {{name}} and {{raw:name}} tokens", () => {
    const references = collectManifestReferences([
      flowEntry([
        {
          id: "s1",
          stepType: "sendText",
          text: "Hi {{shoe_size}}, {{raw:Notes}} and {{first_name}}",
        },
      ]),
    ])

    expect([...references.customFieldNames].sort()).toEqual([
      "Notes",
      "shoe_size",
    ])
  })

  test("returns nothing for entries with no references", () => {
    const references = collectManifestReferences([
      { sourceId: "x", name: "plain" },
    ])

    expect(references.tagIds.size).toBe(0)
    expect(references.customFieldIds.size).toBe(0)
    expect(references.customFieldNames.size).toBe(0)
  })
})

describe("collectManifestReferences: bot fields", () => {
  test("finds a bot field from a slot and from a {{bot_field:<id>}} token in any entry kind", () => {
    const references = collectManifestReferences([
      flowEntry([
        { id: "s1", stepType: "setCustomField", inputFieldId: "bot_field:11" },
      ]),
      {
        sourceId: "trigger-1",
        actions: [{ actionType: "sendMessage", text: "Hi {{bot_field:22}}" }],
      },
      { sourceId: "keyword-1", reply: { text: "{{ bot_field:33 }}" } },
      {
        sourceId: "agent-1",
        prompt: "Offer: {{bot_field:44}} and {{first_name}}",
      },
    ])

    expect([...references.botFieldIds].sort()).toEqual(["11", "22", "33", "44"])
  })

  test("ignores a malformed bot-field slot", () => {
    const references = collectManifestReferences([
      flowEntry([
        { id: "s1", stepType: "setCustomField", inputFieldId: "bot_field:abc" },
      ]),
    ])

    expect([...references.botFieldIds]).toEqual([])
  })
})

describe("customFieldNameFromToken", () => {
  test.each([
    ["shoe_size", "shoe_size"],
    ["  shoe_size  ", "shoe_size"],
    ["raw:Notes", "Notes"],
  ])("%s addresses custom field %s", (token, expected) => {
    expect(customFieldNameFromToken(token)).toBe(expected)
  })

  test.each([
    "first_name",
    "coupon:SUMMER",
    "bot_field:123",
    "pipelines.deals.name",
    "",
  ])("%s is not a custom-field token", (token) => {
    expect(customFieldNameFromToken(token)).toBeNull()
  })
})
