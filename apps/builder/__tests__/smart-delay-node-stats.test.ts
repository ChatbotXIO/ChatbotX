import type { SmartDelayStepCountRow } from "@chatbotx.io/business/smart-delay"
import { type FlowNode, nodeTypeSchema } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { buildSmartDelayNodeStats } from "../src/features/flows/analytics/smart-delay-node-stats"

const makeNode = (props: {
  id: string
  stepId?: string
  type: string
}): FlowNode =>
  ({
    id: props.id,
    type: props.type,
    data: {
      details: props.stepId
        ? { steps: [{ id: props.stepId, stepType: "wait" }] }
        : { steps: [] },
      isStartNode: false,
      name: props.id,
    },
    position: { x: 0, y: 0 },
  }) as unknown as FlowNode

describe("buildSmartDelayNodeStats", () => {
  test("maps user-facing smart-delay statuses to node stats by first step id", () => {
    const nodes = [
      makeNode({
        id: "wait-node",
        type: nodeTypeSchema.enum.wait,
        stepId: "wait-step",
      }),
      makeNode({
        id: "follow-up-node",
        type: nodeTypeSchema.enum.followUp,
        stepId: "follow-up-step",
      }),
    ]
    const rows: SmartDelayStepCountRow[] = [
      { stepId: "wait-step", status: "pending", total: 2 },
      { stepId: "wait-step", status: "scheduled", total: 3 },
      { stepId: "wait-step", status: "completed", total: 4 },
      { stepId: "wait-step", status: "failed", total: 5 },
      { stepId: "follow-up-step", status: "canceled", total: 6 },
    ]

    expect(buildSmartDelayNodeStats(nodes, rows)).toEqual({
      "wait-node": {
        waiting: 5,
        sent: 4,
      },
      "follow-up-node": {
        waiting: 0,
        sent: 0,
      },
    })
  })

  test("returns zero rows for smart-delay nodes without matching counts", () => {
    expect(
      buildSmartDelayNodeStats(
        [
          makeNode({
            id: "wait-node",
            type: nodeTypeSchema.enum.wait,
            stepId: "wait-step",
          }),
        ],
        [],
      ),
    ).toEqual({
      "wait-node": {
        waiting: 0,
        sent: 0,
      },
    })
  })

  test("does not include non-smart-delay node types", () => {
    expect(
      buildSmartDelayNodeStats(
        [
          makeNode({
            id: "send-node",
            type: nodeTypeSchema.enum.sendMessage,
            stepId: "send-step",
          }),
        ],
        [{ stepId: "send-step", status: "completed", total: 1 }],
      ),
    ).toEqual({})
  })
})
