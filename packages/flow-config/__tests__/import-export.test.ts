import { describe, expect, test } from "vitest"
import {
  buttonStepDefaultFn,
  buttonTypes,
  chooseChannelStepDefaultFn,
  collectCustomFieldReferences,
  collectFieldReferences,
  collectFlowReferenceWarnings,
  conditionNodeDefaultFn,
  FLOW_EXPORT_FORMAT_VERSION,
  type FlowExportedFlow,
  openWebsiteStepDefaultFn,
  parseFlowExport,
  remapCustomFieldReferences,
  sendCardStepDefaultFn,
  sendCarouselStepDefaultFn,
  sendMessageNodeDefaultFn,
  splitTrafficNodeDefaultFn,
  startAnotherNodeStepDefaultFn,
  startExternalFlowStepDefaultFn,
  stepTypes,
  subscribeSequenceStepDefaultFn,
} from "../src"

const buildFixtureFlow = (): FlowExportedFlow => {
  const sendMessageNode = sendMessageNodeDefaultFn({
    labelVersion: 1,
    nodeProps: { id: "1" },
    detailProps: {
      quickReplies: [
        {
          ...buttonStepDefaultFn({ label: "Yes" }),
          id: "10",
          buttonType: buttonTypes.enum.startExternalFlow,
          beforeStep: startExternalFlowStepDefaultFn({ flowId: "999" }),
          steps: [],
        },
      ],
      steps: [{ ...subscribeSequenceStepDefaultFn(), sequenceId: "555" }],
    },
  })

  const conditionNode = conditionNodeDefaultFn({
    labelVersion: 1,
    nodeProps: { id: "2" },
    detailProps: {
      steps: [
        {
          id: "cond-1",
          stepType: stepTypes.enum.condition,
          otherwiseId: "otherwise-1",
          cases: [
            {
              id: "case-1",
              operator: "and",
              conditions: [{ field: "name", operator: "equals", value: "Ada" }],
            },
          ],
        },
      ],
    },
  })

  const splitTrafficNode = splitTrafficNodeDefaultFn({
    labelVersion: 1,
    nodeProps: { id: "3" },
  })

  return {
    name: "Fixture flow",
    active: true,
    enableInInbox: true,
    startNodeId: sendMessageNode.id,
    nodes: [sendMessageNode, conditionNode, splitTrafficNode],
    edges: [
      {
        id: "e1",
        source: sendMessageNode.id,
        sourceHandle: "10",
        target: conditionNode.id,
        targetHandle: "target",
      },
      {
        id: "e2",
        source: conditionNode.id,
        sourceHandle: conditionNode.data.details.steps[0].otherwiseId,
        target: splitTrafficNode.id,
        targetHandle: "target",
      },
    ],
  }
}

describe("flow export/import round trip", () => {
  test("nodes, edges, and startNodeId survive export -> import byte for byte", () => {
    const flow = buildFixtureFlow()
    const envelope = {
      formatVersion: FLOW_EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      source: { workspaceId: "1", flowId: "1" },
      flows: [flow],
    }

    const serialized = JSON.parse(JSON.stringify(envelope))
    const result = parseFlowExport(serialized)

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    const importedFlow = result.data.flows[0]
    expect(importedFlow.nodes).toEqual(flow.nodes)
    expect(importedFlow.edges).toEqual(flow.edges)
    expect(importedFlow.startNodeId).toEqual(flow.startNodeId)
  })

  test("an export produced before the botFields manifest existed still parses, defaulting botFields to {}", () => {
    const flow = buildFixtureFlow()
    const envelope: Record<string, unknown> = {
      formatVersion: FLOW_EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      source: { workspaceId: "1", flowId: "1" },
      flows: [flow],
      customFields: {},
      // Deliberately no `botFields` key — simulates an export written before
      // this manifest was added.
    }

    const result = parseFlowExport(envelope)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.botFields).toEqual({})
    }
  })

  test("parses a botFields manifest entry alongside customFields", () => {
    const flow = buildFixtureFlow()
    const envelope = {
      formatVersion: FLOW_EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      source: { workspaceId: "1", flowId: "1" },
      flows: [flow],
      customFields: { "42": { name: "Birthday", type: "date" } },
      botFields: { "7": { name: "Loyalty Points", type: "number" } },
    }

    const result = parseFlowExport(envelope)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.botFields).toEqual({
        "7": { name: "Loyalty Points", type: "number" },
      })
    }
  })

  test("rejects a botFields manifest entry whose name starts with the reserved bot_field: prefix", () => {
    const flow = buildFixtureFlow()
    const envelope = {
      formatVersion: FLOW_EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      source: { workspaceId: "1", flowId: "1" },
      flows: [flow],
      customFields: {},
      botFields: { "7": { name: "bot_field:123", type: "number" } },
    }

    const result = parseFlowExport(envelope)

    expect(result.ok).toBe(false)
  })

  // customFields intentionally does NOT reject the reserved prefix: `CustomField`
  // predates the guard, so a legacy workspace can already contain a name that
  // collides with it. Rejecting the manifest here would turn a pre-existing
  // data-hygiene issue into a hard import failure. See the comment on
  // `flowExportCustomFieldSchema`.
  test("still accepts a customFields manifest entry whose name starts with the reserved bot_field: prefix (legacy data)", () => {
    const flow = buildFixtureFlow()
    const envelope = {
      formatVersion: FLOW_EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      source: { workspaceId: "1", flowId: "1" },
      flows: [flow],
      customFields: { "42": { name: "bot_field:123", type: "shortText" } },
      botFields: {},
    }

    const result = parseFlowExport(envelope)

    expect(result.ok).toBe(true)
  })

  test("rejects an unknown formatVersion", () => {
    const result = parseFlowExport({
      formatVersion: 999,
      exportedAt: new Date().toISOString(),
      source: { workspaceId: "1", flowId: "1" },
      flows: [],
    })

    expect(result.ok).toBe(false)
  })

  test("rejects malformed JSON payloads", () => {
    const result = parseFlowExport({ not: "an export" })
    expect(result.ok).toBe(false)
  })

  test("rejects a node failing flowVersionSchema", () => {
    const flow = buildFixtureFlow()
    const brokenFlow = {
      ...flow,
      nodes: [{ ...flow.nodes[0], type: "notARealNodeType" }],
    }

    const result = parseFlowExport({
      formatVersion: FLOW_EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      source: { workspaceId: "1", flowId: "1" },
      flows: [brokenFlow],
    })

    expect(result.ok).toBe(false)
  })

  /**
   * Requirement-2 regression guard: import must share publish's per-channel
   * step rules, not just the bare node union. A carousel that publish would
   * reject on WhatsApp must also be rejected on import.
   */
  test("rejects a WhatsApp carousel card that mixes a link button with a reply", () => {
    const websiteButton = {
      ...buttonStepDefaultFn({ label: "Open" }),
      buttonType: buttonTypes.enum.openWebsite,
      beforeStep: { ...openWebsiteStepDefaultFn(), url: "https://example.com" },
    }
    const replyButton = buttonStepDefaultFn({ label: "Yes" })

    const node = sendMessageNodeDefaultFn({
      labelVersion: 1,
      nodeProps: { id: "1" },
      detailProps: {
        beforeStep: chooseChannelStepDefaultFn({ channel: "whatsapp" }),
      },
    })
    const carouselNode = {
      ...node,
      data: {
        ...node.data,
        details: {
          ...node.data.details,
          steps: [
            {
              ...sendCarouselStepDefaultFn(),
              cards: [
                {
                  ...sendCardStepDefaultFn(),
                  title: "Card",
                  buttons: [websiteButton, replyButton],
                },
              ],
            },
          ],
        },
      },
    }

    const flow: FlowExportedFlow = {
      name: "Broken carousel flow",
      active: true,
      enableInInbox: true,
      startNodeId: carouselNode.id,
      nodes: [carouselNode],
      edges: [],
    }

    const result = parseFlowExport({
      formatVersion: FLOW_EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      source: { workspaceId: "1", flowId: "1" },
      flows: [flow],
    })

    expect(result.ok).toBe(false)
  })
})

describe("collectFlowReferenceWarnings", () => {
  test("finds a sequenceId and a cross-flow flowId in a nested button beforeStep", () => {
    const flow = buildFixtureFlow()
    const warnings = collectFlowReferenceWarnings(flow)

    expect(warnings).toContainEqual(
      expect.objectContaining({ entityKind: "sequence" }),
    )
    expect(warnings).toContainEqual(
      expect.objectContaining({ entityKind: "flow", value: "999" }),
    )
  })

  test("does not flag addContactTag.tags as a reference", () => {
    const sendMessageNode = sendMessageNodeDefaultFn({
      labelVersion: 1,
      nodeProps: { id: "1" },
      detailProps: {
        steps: [
          {
            id: "20",
            stepType: stepTypes.enum.addContactTag,
            tags: ["vip", "newsletter"],
          },
        ],
      },
    })
    const flow: FlowExportedFlow = {
      name: "Tag flow",
      active: true,
      enableInInbox: true,
      startNodeId: sendMessageNode.id,
      nodes: [sendMessageNode],
      edges: [],
    }

    const warnings = collectFlowReferenceWarnings(flow)
    expect(warnings).toEqual([])
  })

  test("does not flag startAnotherNode.nodeId (same-flow reference)", () => {
    const sendMessageNode = sendMessageNodeDefaultFn({
      labelVersion: 1,
      nodeProps: { id: "1" },
      detailProps: {
        quickReplies: [
          {
            ...buttonStepDefaultFn({ label: "Continue" }),
            id: "11",
            buttonType: buttonTypes.enum.startAnotherNode,
            beforeStep: startAnotherNodeStepDefaultFn({ nodeId: "2" }),
            steps: [],
          },
        ],
      },
    })
    const flow: FlowExportedFlow = {
      name: "Node jump flow",
      active: true,
      enableInInbox: true,
      startNodeId: sendMessageNode.id,
      nodes: [sendMessageNode],
      edges: [],
    }

    const warnings = collectFlowReferenceWarnings(flow)
    expect(warnings).toEqual([])
  })
})

describe("collectCustomFieldReferences", () => {
  test("system slugs and merge-tag text never appear in the collected ids", () => {
    const ids = collectCustomFieldReferences({
      nodes: [
        {
          id: "1",
          data: {
            details: {
              steps: [
                {
                  id: "s1",
                  stepType: "setCustomField",
                  inputFieldId: "first_name",
                },
                {
                  id: "s2",
                  stepType: "setCustomField",
                  inputFieldId: "user_tags",
                },
                { id: "s3", stepType: "setCustomField", inputFieldId: "42" },
              ],
            },
          },
        },
      ],
      edges: [],
    })

    expect(ids).toEqual(["42"])
  })

  test("dedupes the same id referenced from multiple slots", () => {
    const ids = collectCustomFieldReferences({
      nodes: [
        {
          id: "1",
          data: {
            details: {
              steps: [
                { id: "s1", stepType: "setCustomField", inputFieldId: "42" },
                {
                  id: "s2",
                  stepType: "condition",
                  cases: [
                    {
                      id: "c1",
                      conditions: [
                        { customFieldId: "42" },
                        { customFieldId: "43" },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
      edges: [],
    })

    expect(ids.sort()).toEqual(["42", "43"])
  })

  test("collects across the awkward per-step shapes", () => {
    const ids = collectCustomFieldReferences({
      nodes: [
        {
          id: "1",
          data: {
            details: {
              steps: [
                {
                  id: "s1",
                  stepType: "condition",
                  cases: [{ id: "c1", conditions: [{ customFieldId: "1" }] }],
                },
                {
                  id: "s2",
                  stepType: "aiExtractData",
                  extractFields: [{ customFieldId: "2" }],
                },
                {
                  id: "s3",
                  stepType: "getDataFromJson",
                  inputFieldId: "3",
                  mapping: [{ jsonPath: "$.a", outputFieldId: "4" }],
                },
                {
                  id: "s4",
                  stepType: "whatsappFlow",
                  flow: {
                    fieldMappings: [
                      { customFieldId: "5" },
                      { customFieldId: null },
                    ],
                  },
                },
                {
                  id: "s5",
                  stepType: "appointmentScheduling",
                  mode: "checkAvailabilityFromCustomField",
                  startDateFieldId: "6",
                  endDateFieldId: "7",
                  outputCustomFieldId: "8",
                },
                {
                  id: "s6",
                  stepType: "spreadsheetSendData",
                  map: [{ customFieldId: "" }],
                },
              ],
            },
          },
        },
      ],
      edges: [],
    })

    expect(ids.sort()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"])
  })
})

describe("collectFieldReferences", () => {
  test("splits numeric customField ids and bot_field tokens into their own lists", () => {
    const result = collectFieldReferences({
      nodes: [
        {
          id: "1",
          data: {
            details: {
              steps: [
                { id: "s1", stepType: "setCustomField", inputFieldId: "42" },
                {
                  id: "s2",
                  stepType: "setCustomField",
                  inputFieldId: "bot_field:7",
                },
                {
                  id: "s3",
                  stepType: "condition",
                  cases: [
                    {
                      id: "c1",
                      conditions: [{ customFieldId: "bot_field:8" }],
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
      edges: [],
    })

    expect(result.customFieldIds).toEqual(["42"])
    expect(result.botFieldIds.sort()).toEqual(["7", "8"])
  })

  test("a malformed near-token contributes to neither list", () => {
    const result = collectFieldReferences({
      nodes: [
        {
          id: "1",
          data: {
            details: {
              steps: [
                {
                  id: "s1",
                  stepType: "setCustomField",
                  inputFieldId: "bot_field:abc",
                },
              ],
            },
          },
        },
      ],
      edges: [],
    })

    expect(result.customFieldIds).toEqual([])
    expect(result.botFieldIds).toEqual([])
  })

  test("collects a dedicated botFieldId key (Condition step's botField condition) as a raw id, not a token", () => {
    const result = collectFieldReferences({
      nodes: [
        {
          id: "1",
          data: {
            details: {
              steps: [
                {
                  id: "s1",
                  stepType: "condition",
                  cases: [
                    {
                      id: "c1",
                      conditions: [
                        { field: "botField", botFieldId: "9", operator: "eq" },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
      edges: [],
    })

    expect(result.botFieldIds).toEqual(["9"])
    expect(result.customFieldIds).toEqual([])
  })

  test("dedupes bot field ids referenced from multiple slots", () => {
    const result = collectFieldReferences({
      nodes: [
        {
          id: "1",
          data: {
            details: {
              steps: [
                {
                  id: "s1",
                  stepType: "setCustomField",
                  inputFieldId: "bot_field:7",
                },
                {
                  id: "s2",
                  stepType: "condition",
                  cases: [
                    {
                      id: "c1",
                      conditions: [{ customFieldId: "bot_field:7" }],
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
      edges: [],
    })

    expect(result.botFieldIds).toEqual(["7"])
  })

  test("collectCustomFieldReferences stays behaviorally identical (thin wrapper)", () => {
    const flow = {
      nodes: [
        {
          id: "1",
          data: {
            details: {
              steps: [
                { id: "s1", stepType: "setCustomField", inputFieldId: "42" },
                {
                  id: "s2",
                  stepType: "setCustomField",
                  inputFieldId: "bot_field:7",
                },
              ],
            },
          },
        },
      ],
      edges: [],
    }

    expect(collectCustomFieldReferences(flow)).toEqual(
      collectFieldReferences(flow).customFieldIds,
    )
    expect(collectCustomFieldReferences(flow)).toEqual(["42"])
  })
})

describe("remapCustomFieldReferences", () => {
  test("rewrites a mapped id and leaves an unmapped id untouched", () => {
    const flow = {
      nodes: [
        {
          id: "1",
          data: {
            details: {
              steps: [
                { id: "s1", stepType: "setCustomField", inputFieldId: "42" },
                { id: "s2", stepType: "setCustomField", inputFieldId: "999" },
              ],
            },
          },
        },
      ],
      edges: [],
    }

    const remapped = remapCustomFieldReferences(
      flow,
      new Map([["42", "target-42"]]),
    )

    expect(remapped.nodes[0].data.details.steps[0].inputFieldId).toBe(
      "target-42",
    )
    expect(remapped.nodes[0].data.details.steps[1].inputFieldId).toBe("999")
  })

  test("preserves sibling keys (customFieldType, valueType) on a condition row", () => {
    const flow = {
      nodes: [
        {
          id: "1",
          data: {
            details: {
              steps: [
                {
                  id: "s1",
                  stepType: "condition",
                  cases: [
                    {
                      id: "c1",
                      conditions: [
                        {
                          customFieldId: "42",
                          customFieldType: "date",
                          valueType: "date",
                          operator: "eq",
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
      edges: [],
    }

    const remapped = remapCustomFieldReferences(
      flow,
      new Map([["42", "target-42"]]),
    )

    const remappedCondition =
      remapped.nodes[0].data.details.steps[0].cases[0].conditions[0]
    expect(remappedCondition).toEqual({
      customFieldId: "target-42",
      customFieldType: "date",
      valueType: "date",
      operator: "eq",
    })
  })

  test("does not mutate the input", () => {
    const flow = {
      nodes: [
        {
          id: "1",
          data: {
            details: {
              steps: [
                { id: "s1", stepType: "setCustomField", inputFieldId: "42" },
              ],
            },
          },
        },
      ],
      edges: [],
    }
    const original = JSON.parse(JSON.stringify(flow))

    remapCustomFieldReferences(flow, new Map([["42", "target-42"]]))

    expect(flow).toEqual(original)
  })
})

describe("deeply nested graphs", () => {
  // A ~100KB export (far inside the 5MB cap) can reach tens of thousands of
  // nesting levels through a `z.any()` step slot; before the depth ceiling the
  // recursive walkers blew the stack with an opaque RangeError.
  const deeplyNested = (depth: number): unknown => {
    let value: unknown = { inputFieldId: "42" }
    for (let index = 0; index < depth; index++) {
      value = { child: value }
    }
    return value
  }

  test("collectFlowReferenceWarnings does not overflow the stack", () => {
    expect(() =>
      collectFlowReferenceWarnings({
        nodes: [deeplyNested(50_000)],
        edges: [],
      } as unknown as FlowExportedFlow),
    ).not.toThrow()
  })

  test("collectCustomFieldReferences does not overflow the stack", () => {
    expect(() =>
      collectCustomFieldReferences({
        nodes: [deeplyNested(50_000)],
        edges: [],
      }),
    ).not.toThrow()
  })

  // Iterative so the assertion itself cannot overflow the stack the way a
  // recursive JSON.stringify over the same structure would.
  const descend = (value: unknown, depth: number): unknown => {
    let current = value
    for (let index = 0; index < depth; index++) {
      current = (current as { child: unknown }).child
    }
    return current
  }

  test("remapCustomFieldReferences preserves data past the depth ceiling", () => {
    const flow = { nodes: [deeplyNested(50_000)], edges: [] }

    let remapped: { nodes: unknown[]; edges: unknown[] } | undefined
    expect(() => {
      remapped = remapCustomFieldReferences(
        flow as never,
        new Map([["42", "target-42"]]),
      )
    }).not.toThrow()

    // Truncation must never drop the subtree — the deep leaf still resolves.
    expect(descend(remapped?.nodes[0], 50_000)).toEqual({ inputFieldId: "42" })
  })

  test("still remaps references at realistic depths", () => {
    const flow = { nodes: [deeplyNested(10)], edges: [] }

    const remapped = remapCustomFieldReferences(
      flow as never,
      new Map([["42", "target-42"]]),
    )

    expect(descend(remapped.nodes[0], 10)).toEqual({
      inputFieldId: "target-42",
    })
  })
})
