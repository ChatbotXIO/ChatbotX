import { describe, expect, test } from "vitest"
import {
  removeUnresolvedReferences,
  removeUnresolvedReferencesDetailed,
} from "../src/import-export/unresolved-references"

const flowWith = (step: Record<string, unknown>) => ({
  nodes: [{ id: "n1", data: { details: { steps: [step] } } }],
  edges: [],
})

const stepOf = (flow: ReturnType<typeof flowWith>) =>
  flow.nodes[0]?.data.details.steps[0]

const slot = (key: string) => `nodes[0].data.details.steps[0].${key}`

describe("removeUnresolvedReferences", () => {
  test("drops an array element", () => {
    const flow = flowWith({
      id: "s",
      stepType: "addContactTag",
      tagIds: ["1", "2", "3"],
    })

    const cleaned = removeUnresolvedReferences(flow, [
      { path: slot("tagIds[0]") },
      { path: slot("tagIds[2]") },
    ])

    expect(stepOf(cleaned)?.tagIds).toEqual(["2"])
  })

  test("deletes an optional slot", () => {
    const flow = flowWith({
      id: "s",
      stepType: "subscribeSequence",
      sequenceId: "9",
    })

    const cleaned = removeUnresolvedReferences(flow, [
      { path: slot("sequenceId") },
    ])

    expect(stepOf(cleaned)).not.toHaveProperty("sequenceId")
  })

  test("sets a nullable slot to null", () => {
    const flow = flowWith({
      id: "s",
      stepType: "sendWaTemplateMessage",
      inboxId: "5",
    })

    const cleaned = removeUnresolvedReferences(flow, [
      { path: slot("inboxId") },
    ])

    expect(stepOf(cleaned)?.inboxId).toBeNull()
  })

  test("clears a required slot to the editor's empty value", () => {
    const flow = flowWith({
      id: "s",
      stepType: "setCustomField",
      inputFieldId: "77",
    })

    const cleaned = removeUnresolvedReferences(flow, [
      { path: slot("inputFieldId") },
    ])

    expect(stepOf(cleaned)?.inputFieldId).toBe("")
  })

  test("treats a Condition row's id slot as optional", () => {
    const flow = flowWith({
      id: "s",
      stepType: "condition",
      conditions: [
        { field: "customField", operator: "eq", customFieldId: "77" },
      ],
    })

    const cleaned = removeUnresolvedReferences(flow, [
      { path: slot("conditions[0].customFieldId") },
    ])

    expect(stepOf(cleaned)?.conditions[0]).not.toHaveProperty("customFieldId")
  })

  test("never mutates the input and skips a path that no longer resolves", () => {
    const flow = flowWith({ id: "s", stepType: "addContactTag", tagIds: ["1"] })

    const cleaned = removeUnresolvedReferences(flow, [
      { path: slot("tagIds[0]") },
      { path: "nodes[9].data" },
    ])

    expect(stepOf(flow)?.tagIds).toEqual(["1"])
    expect(stepOf(cleaned)?.tagIds).toEqual([])
  })

  test("removes several elements of one array whatever order they are reported in", () => {
    const flow = flowWith({
      id: "s",
      stepType: "addContactTag",
      tagIds: ["a", "b", "c", "d"],
    })

    const cleaned = removeUnresolvedReferences(flow, [
      { path: slot("tagIds[1]") },
      { path: slot("tagIds[3]") },
      { path: slot("tagIds[0]") },
    ])

    expect(stepOf(cleaned)?.tagIds).toEqual(["c"])
  })

  test("a required pipeline stage is cleared, not deleted", () => {
    const flow = flowWith({ id: "s", stepType: "pipeline", stageId: "9" })

    const cleaned = removeUnresolvedReferences(flow, [
      { path: slot("stageId") },
    ])

    expect(stepOf(cleaned)?.stageId).toBe("")
  })

  test("a nullable WhatsApp flow field mapping becomes null", () => {
    const flow = flowWith({
      id: "s",
      stepType: "whatsappFlow",
      flow: { fieldMappings: [{ customFieldId: "7" }] },
    })

    const cleaned = removeUnresolvedReferences(flow, [
      { path: slot("flow.fieldMappings[0].customFieldId") },
    ])

    expect(stepOf(cleaned)?.flow.fieldMappings[0]?.customFieldId).toBeNull()
  })

  test("returns the input itself when there is nothing to remove", () => {
    const flow = flowWith({ id: "s", stepType: "addContactTag", tagIds: ["1"] })

    expect(removeUnresolvedReferences(flow, [])).toBe(flow)
  })
})

describe("removeUnresolvedReferencesDetailed", () => {
  const stepsFlow = () => ({
    nodes: [
      {
        id: "1",
        data: {
          details: {
            steps: [
              { id: "a", stepType: "aiSpeechToText", inputFieldId: "9" },
              { id: "b", stepType: "setCustomField", inputFieldId: "10" },
            ],
          },
        },
      },
    ],
    edges: [],
  })

  test("a required slot inside a flow step blocks the flow instead of dropping the step", () => {
    const flow = stepsFlow()
    const result = removeUnresolvedReferencesDetailed(flow, [
      { path: "nodes[0].data.details.steps[0].inputFieldId" },
    ])

    expect(result.blocked).toEqual([
      "nodes[0].data.details.steps[0].inputFieldId",
    ])
    expect(result.droppedElements).toEqual([])
    expect(result.value.nodes[0]?.data.details.steps.map((s) => s.id)).toEqual([
      "a",
      "b",
    ])
    expect(result.value.nodes[0]?.data.details.steps[0]?.inputFieldId).toBe("")
  })

  test("a required slot inside an action row drops that row only", () => {
    const flow = {
      nodes: [
        {
          id: "1",
          data: {
            details: {
              steps: [
                {
                  id: "a",
                  stepType: "performActions",
                  actions: [
                    { actionType: "setField", customFieldId: "9" },
                    { actionType: "setField", customFieldId: "10" },
                  ],
                },
              ],
            },
          },
        },
      ],
      edges: [],
    }
    const result = removeUnresolvedReferencesDetailed(flow, [
      { path: "nodes[0].data.details.steps[0].actions[0].customFieldId" },
    ])

    expect(result.droppedElements).toHaveLength(1)
    expect(result.blocked).toEqual([])
    expect(
      result.value.nodes[0]?.data.details.steps[0]?.actions.map(
        (action) => action.customFieldId,
      ),
    ).toEqual(["10"])
  })

  test("an optional slot is deleted and a nullable slot nulled without touching the step", () => {
    const flow = {
      nodes: [
        {
          id: "1",
          data: {
            details: {
              steps: [
                { id: "a", stepType: "subscribeSequence", sequenceId: "9" },
                { id: "b", stepType: "sendWaTemplateMessage", inboxId: "5" },
              ],
            },
          },
        },
      ],
      edges: [],
    }
    const result = removeUnresolvedReferencesDetailed(flow, [
      { path: "nodes[0].data.details.steps[0].sequenceId" },
      { path: "nodes[0].data.details.steps[1].inboxId" },
    ])

    expect(result.blocked).toEqual([])
    expect(result.droppedElements).toEqual([])
    const [first, second] = result.value.nodes[0]?.data.details.steps ?? []
    expect(first).not.toHaveProperty("sequenceId")
    expect(second?.inboxId).toBeNull()
  })

  test("reports a required slot outside any droppable element as blocked", () => {
    const flow = { nodes: [{ id: "1", data: { flowId: "7" } }], edges: [] }
    const result = removeUnresolvedReferencesDetailed(flow, [
      { path: "nodes[0].data.flowId" },
    ])
    expect(result.blocked).toEqual(["nodes[0].data.flowId"])
  })
})
