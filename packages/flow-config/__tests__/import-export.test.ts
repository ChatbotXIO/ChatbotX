import { describe, expect, test } from "vitest"
import {
  buttonStepDefaultFn,
  buttonTypes,
  chooseChannelStepDefaultFn,
  collectFlowReferenceWarnings,
  conditionNodeDefaultFn,
  FLOW_EXPORT_FORMAT_VERSION,
  type FlowExportedFlow,
  openWebsiteStepDefaultFn,
  parseFlowExport,
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
