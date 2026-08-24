import { describe, expect, test } from "vitest"
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
})
