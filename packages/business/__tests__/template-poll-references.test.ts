import { remapFlowGraphReferences } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { FLOW_INSERT_KINDS } from "../src/template/adapters/flows/kinds"
import { collectResourceDependencies } from "../src/template/manifest-references"

const conditionStep = (pollIds: string[]) => ({
  id: "s1",
  stepType: "condition",
  conditions: [{ field: "votedOnPoll", operator: "eq", value: pollIds }],
})

const flowGraph = (pollIds: string[]) => ({
  nodes: [
    {
      id: "n1",
      data: { details: { steps: [conditionStep(pollIds)] } },
    },
  ],
  edges: [],
})

// A flow branching on "Voted on the poll" stops working in the target unless
// the poll travels with it and its id is remapped to the installed copy.
describe("votedOnPoll in template flows", () => {
  test("a flow whose Condition names a poll takes that poll along", () => {
    const entry = {
      sourceId: "flow-1",
      flowVersion: flowGraph(["9001"]),
    }

    expect(collectResourceDependencies(entry)).toContainEqual({
      category: "polls",
      sourceId: "9001",
    })
  })

  test("a flow install remaps votedOnPoll poll ids to the installed polls", () => {
    const unresolved: unknown[] = []
    const remapped = remapFlowGraphReferences(
      flowGraph(["9001", "9002"]) as never,
      {
        poll: new Map([
          ["9001", "7001"],
          ["9002", "7002"],
        ]),
      },
      {
        kinds: FLOW_INSERT_KINDS,
        onUnresolved: (reference: unknown) => unresolved.push(reference),
      },
    )

    const step = (
      remapped.nodes[0] as unknown as {
        data: {
          details: { steps: { conditions: { value: string[] }[] }[] }
        }
      }
    ).data.details.steps[0]
    expect(step?.conditions[0]?.value).toEqual(["7001", "7002"])
    expect(unresolved).toEqual([])
  })
})
