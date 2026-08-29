import { describe, expect, test } from "vitest"
import {
  BOT_FIELD_REFERENCE_PREFIX,
  FieldReferenceKind,
} from "../src/field-reference"
import { PREFIXED_REFERENCE_ENTITY_KIND } from "../src/import-export/reference-fields"
import {
  collectReferencesByKind,
  remapFlowGraphReferences,
  remapReferences,
} from "../src/import-export/remap"

describe("remapReferences — multi-kind", () => {
  test("remaps distinct kinds independently in one pass", () => {
    const value = {
      customFieldId: "cf-1",
      aiAgentId: "agent-1",
      calendarId: "cal-1",
    }

    const remapped = remapReferences(value, {
      customField: new Map([["cf-1", "cf-target"]]),
      aiAgent: new Map([["agent-1", "agent-target"]]),
      calendar: new Map([["cal-1", "cal-target"]]),
    })

    expect(remapped).toEqual({
      customFieldId: "cf-target",
      aiAgentId: "agent-target",
      calendarId: "cal-target",
    })
  })

  test("leaves an unmapped id untouched and reports it via onUnresolved", () => {
    const unresolved: unknown[] = []
    const remapped = remapReferences(
      { customFieldId: "cf-missing" },
      {},
      { onUnresolved: (ref) => unresolved.push(ref) },
    )

    expect(remapped).toEqual({ customFieldId: "cf-missing" })
    expect(unresolved).toEqual([
      { entityKind: "customField", path: "customFieldId", value: "cf-missing" },
    ])
  })

  test("kinds option scopes remapping so unlisted kinds pass through inert", () => {
    const remapped = remapReferences(
      { customFieldId: "cf-1", aiAgentId: "agent-1" },
      {
        customField: new Map([["cf-1", "cf-target"]]),
        aiAgent: new Map([["agent-1", "agent-target"]]),
      },
      { kinds: ["customField"] },
    )

    expect(remapped).toEqual({
      customFieldId: "cf-target",
      aiAgentId: "agent-1",
    })
  })
})

describe("remapReferences — botField scalar key (Condition step's botFieldId)", () => {
  test("remaps a dedicated botFieldId key directly against idMaps.botField (no bot_field: token)", () => {
    const remapped = remapReferences(
      { field: "botField", botFieldId: "bf-1", operator: "eq" },
      { botField: new Map([["bf-1", "bf-target"]]) },
    )

    expect(remapped).toEqual({
      field: "botField",
      botFieldId: "bf-target",
      operator: "eq",
    })
  })

  test("leaves an unmapped botFieldId untouched and reports it via onUnresolved", () => {
    const unresolved: unknown[] = []
    const remapped = remapReferences(
      { botFieldId: "bf-missing" },
      {},
      { onUnresolved: (ref) => unresolved.push(ref) },
    )

    expect(remapped).toEqual({ botFieldId: "bf-missing" })
    expect(unresolved).toEqual([
      { entityKind: "botField", path: "botFieldId", value: "bf-missing" },
    ])
  })

  test("a sibling customFieldId on the same object is unaffected by the botField map", () => {
    const remapped = remapReferences(
      { botFieldId: "bf-1", customFieldId: "cf-1" },
      {
        botField: new Map([["bf-1", "bf-target"]]),
        customField: new Map([["cf-1", "cf-target"]]),
      },
    )

    expect(remapped).toEqual({
      botFieldId: "bf-target",
      customFieldId: "cf-target",
    })
  })
})

describe("PREFIXED_REFERENCE_ENTITY_KIND — bot_field entry", () => {
  test("registers the same prefix and kind field-reference.ts defines", () => {
    expect(PREFIXED_REFERENCE_ENTITY_KIND[BOT_FIELD_REFERENCE_PREFIX]).toBe(
      FieldReferenceKind.botField,
    )
  })
})

describe("remapReferences — bot_field scalar slot tokens", () => {
  test("remaps a well-formed bot_field token in a customField-kind slot against idMaps.botField", () => {
    const remapped = remapReferences(
      { inputFieldId: "bot_field:1" },
      { botField: new Map([["1", "42"]]) },
    )

    expect(remapped).toEqual({ inputFieldId: "bot_field:42" })
  })

  test("leaves an unmapped bot_field token untouched and reports it as a botField miss", () => {
    const unresolved: unknown[] = []
    const remapped = remapReferences(
      { customFieldId: "bot_field:99" },
      {},
      { onUnresolved: (ref) => unresolved.push(ref) },
    )

    expect(remapped).toEqual({ customFieldId: "bot_field:99" })
    expect(unresolved).toEqual([
      { entityKind: "botField", path: "customFieldId", value: "99" },
    ])
  })

  test("never misroutes a bot_field token against idMaps.customField", () => {
    const remapped = remapReferences(
      { inputFieldId: "bot_field:1" },
      {
        // A customField map entry keyed "bot_field:1" would only ever be hit
        // if the token were (incorrectly) treated as a literal customField
        // id/name — asserting it stays "bot_field:1" (unresolved botField,
        // not a customField hit) proves the ordering.
        customField: new Map([["bot_field:1", "should-not-apply"]]),
      },
    )

    expect(remapped).toEqual({ inputFieldId: "bot_field:1" })
  })

  test("a malformed near-token is treated as a legacy customField key, not a botField reference", () => {
    const unresolved: unknown[] = []
    const remapped = remapReferences(
      { inputFieldId: "bot_field:abc" },
      { customField: new Map([["bot_field:abc", "target"]]) },
      { onUnresolved: (ref) => unresolved.push(ref) },
    )

    expect(remapped).toEqual({ inputFieldId: "target" })
    expect(unresolved).toEqual([])
  })

  test("a malformed near-token with no customField match is left untouched and warns as customField, never botField", () => {
    const unresolved: unknown[] = []
    const remapped = remapReferences(
      { inputFieldId: "bot_field:" },
      {},
      { onUnresolved: (ref) => unresolved.push(ref) },
    )

    expect(remapped).toEqual({ inputFieldId: "bot_field:" })
    expect(unresolved).toEqual([
      { entityKind: "customField", path: "inputFieldId", value: "bot_field:" },
    ])
  })

  test("kinds gating: kinds:['botField'] remaps the token and leaves a sibling customFieldId inert", () => {
    const remapped = remapReferences(
      { inputFieldId: "bot_field:1", customFieldId: "42" },
      {
        botField: new Map([["1", "target-bot"]]),
        customField: new Map([["42", "target-custom"]]),
      },
      { kinds: ["botField"] },
    )

    expect(remapped).toEqual({
      inputFieldId: "bot_field:target-bot",
      customFieldId: "42",
    })
  })

  test("kinds gating: kinds:['customField'] leaves a bot_field token untouched without warning", () => {
    const unresolved: unknown[] = []
    const remapped = remapReferences(
      { inputFieldId: "bot_field:1", customFieldId: "42" },
      {
        botField: new Map([["1", "target-bot"]]),
        customField: new Map([["42", "target-custom"]]),
      },
      { kinds: ["customField"], onUnresolved: (ref) => unresolved.push(ref) },
    )

    expect(remapped).toEqual({
      inputFieldId: "bot_field:1",
      customFieldId: "target-custom",
    })
    expect(unresolved).toEqual([])
  })

  test("does not mutate the input", () => {
    const value = { inputFieldId: "bot_field:1" }
    const original = JSON.parse(JSON.stringify(value))

    remapReferences(value, { botField: new Map([["1", "target"]]) })

    expect(value).toEqual(original)
  })
})

describe("remapReferences — array-valued keys", () => {
  test("remaps each element of tagIds independently", () => {
    const remapped = remapReferences(
      { tagIds: ["tag-1", "tag-2", "tag-missing"] },
      {
        tag: new Map([
          ["tag-1", "target-1"],
          ["tag-2", "target-2"],
        ]),
      },
    )

    expect(remapped).toEqual({
      tagIds: ["target-1", "target-2", "tag-missing"],
    })
  })

  test("remaps addonProductIds via the product map", () => {
    const remapped = remapReferences(
      { addonProductIds: ["p-1"] },
      { product: new Map([["p-1", "p-target"]]) },
    )

    expect(remapped).toEqual({ addonProductIds: ["p-target"] })
  })
})

describe("remapReferences — discriminated union (sourceId)", () => {
  test("resolves sourceId as a trigger id when sourceType is trigger", () => {
    const remapped = remapReferences(
      { sourceType: "trigger", sourceId: "trig-1" },
      { trigger: new Map([["trig-1", "trig-target"]]) },
    )

    expect(remapped).toEqual({ sourceType: "trigger", sourceId: "trig-target" })
  })

  test("resolves sourceId as a webhook id when sourceType is webhook", () => {
    const remapped = remapReferences(
      { sourceType: "webhook", sourceId: "wh-1" },
      { webhook: new Map([["wh-1", "wh-target"]]) },
    )

    expect(remapped).toEqual({ sourceType: "webhook", sourceId: "wh-target" })
  })

  test("leaves sourceId untouched for an unknown discriminator (no corruption)", () => {
    const remapped = remapReferences(
      { sourceType: "somethingElse", sourceId: "raw-1" },
      { trigger: new Map([["raw-1", "should-not-apply"]]) },
    )

    expect(remapped).toEqual({ sourceType: "somethingElse", sourceId: "raw-1" })
  })
})

describe("remapReferences — prefixed tokens (tools)", () => {
  test("rewrites fn:/file:/mcp: prefixed ids inside the tools array", () => {
    const remapped = remapReferences(
      { tools: ["fn:1", "file:2", "mcp:3", "sys:noop"] },
      {
        aiFunction: new Map([["1", "1-target"]]),
        aiFile: new Map([["2", "2-target"]]),
        aiMcpServer: new Map([["3", "3-target"]]),
      },
    )

    expect(remapped).toEqual({
      tools: ["fn:1-target", "file:2-target", "mcp:3-target", "sys:noop"],
    })
  })

  test("does not touch adversarial free text containing fn: outside the tools key", () => {
    const remapped = remapReferences(
      { notes: "see fn:1 for details" },
      { aiFunction: new Map([["1", "1-target"]]) },
    )

    expect(remapped).toEqual({ notes: "see fn:1 for details" })
  })

  test("leaves an unresolved prefixed id untouched", () => {
    const remapped = remapReferences({ tools: ["fn:missing"] }, {})
    expect(remapped).toEqual({ tools: ["fn:missing"] })
  })
})

describe("remapReferences — depth ceiling and immutability", () => {
  const deeplyNested = (depth: number): unknown => {
    let value: unknown = { customFieldId: "cf-1" }
    for (let index = 0; index < depth; index++) {
      value = { child: value }
    }
    return value
  }

  const descend = (value: unknown, depth: number): unknown => {
    let current = value
    for (let index = 0; index < depth; index++) {
      current = (current as { child: unknown }).child
    }
    return current
  }

  test("does not overflow the stack on a deeply nested graph", () => {
    expect(() =>
      remapReferences(deeplyNested(50_000), {
        customField: new Map([["cf-1", "target"]]),
      }),
    ).not.toThrow()
  })

  test("preserves data past the depth ceiling without remapping it", () => {
    const remapped = remapReferences(deeplyNested(50_000), {
      customField: new Map([["cf-1", "target"]]),
    })
    expect(descend(remapped, 50_000)).toEqual({ customFieldId: "cf-1" })
  })

  test("does not mutate the input", () => {
    const value = { customFieldId: "cf-1", nested: { calendarId: "cal-1" } }
    const original = JSON.parse(JSON.stringify(value))

    remapReferences(value, {
      customField: new Map([["cf-1", "target"]]),
      calendar: new Map([["cal-1", "target"]]),
    })

    expect(value).toEqual(original)
  })
})

describe("remapFlowGraphReferences", () => {
  test("walks nodes and edges and preserves the graph shape", () => {
    const graph = {
      nodes: [{ id: "1", data: { customFieldId: "cf-1" } }],
      edges: [{ id: "e1", source: "1", target: "2" }],
    }

    const remapped = remapFlowGraphReferences(graph, {
      customField: new Map([["cf-1", "target"]]),
    })

    expect(remapped.nodes[0].data.customFieldId).toBe("target")
    expect(remapped.edges).toEqual(graph.edges)
  })
})

describe("collectReferencesByKind", () => {
  test("groups discovered reference ids by entity kind", () => {
    const byKind = collectReferencesByKind({
      customFieldId: "cf-1",
      aiAgentId: "agent-1",
      tagIds: ["tag-1", "tag-2"],
    })

    expect(byKind.get("customField")).toEqual(new Set(["cf-1"]))
    expect(byKind.get("aiAgent")).toEqual(new Set(["agent-1"]))
    expect(byKind.get("tag")).toEqual(new Set(["tag-1", "tag-2"]))
  })

  test("scopes collection to the given kinds", () => {
    const byKind = collectReferencesByKind(
      { customFieldId: "cf-1", aiAgentId: "agent-1" },
      ["customField"],
    )

    expect(byKind.has("customField")).toBe(true)
    expect(byKind.has("aiAgent")).toBe(false)
  })

  test("groups a bot_field token under botField, not customField", () => {
    const byKind = collectReferencesByKind({
      inputFieldId: "bot_field:7",
      customFieldId: "42",
    })

    expect(byKind.get("botField")).toEqual(new Set(["7"]))
    expect(byKind.get("customField")).toEqual(new Set(["42"]))
  })
})
