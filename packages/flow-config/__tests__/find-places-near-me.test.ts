import { describe, expect, test } from "vitest"
import {
  findPlacesNearMeStepDefaultFn,
  findPlacesNearMeStepSchema,
} from "../src/steps/find-places-near-me"
import { ReplyFormat } from "../src/steps/get-user-data"
import {
  findUpstreamLocationFieldKeys,
  type LocationGraphEdge,
  type LocationGraphNode,
} from "../src/steps/upstream-location-fields"

type GraphStep = {
  id: string
  stepType: string
  replyFormat?: string
  outputFieldId?: string
}

const node = (id: string, steps: GraphStep[]): LocationGraphNode => ({
  id,
  data: { details: { steps } },
})
const edge = (source: string, target: string): LocationGraphEdge => ({
  source,
  target,
})
const locationStep = (id: string, outputFieldId: string): GraphStep => ({
  id,
  stepType: "getUserData",
  replyFormat: ReplyFormat.location,
  outputFieldId,
})
const action = (id: string): GraphStep => ({
  id,
  stepType: "findPlacesNearMe",
})

describe("findPlacesNearMeStepSchema", () => {
  test("schema accepts null and a numeric category id, rejects abc", () => {
    const base = { id: "1", stepType: "findPlacesNearMe" }
    expect(
      findPlacesNearMeStepSchema.safeParse({ ...base, placeCategoryId: null })
        .success,
    ).toBe(true)
    expect(
      findPlacesNearMeStepSchema.safeParse({ ...base, placeCategoryId: "7" })
        .success,
    ).toBe(true)
    expect(
      findPlacesNearMeStepSchema.safeParse({ ...base, placeCategoryId: "abc" })
        .success,
    ).toBe(false)
  })

  test("defaultFn has placeCategoryId null", () => {
    const step = findPlacesNearMeStepDefaultFn()
    expect(step.stepType).toBe("findPlacesNearMe")
    expect(step.placeCategoryId).toBeNull()
    expect(findPlacesNearMeStepSchema.safeParse(step).success).toBe(true)
  })
})

describe("findUpstreamLocationFieldKeys", () => {
  test("finds a location field two nodes upstream", () => {
    const nodes = [
      node("A", [locationStep("a1", "f1")]),
      node("B", [{ id: "b1", stepType: "sendText" }]),
      node("C", [action("s1")]),
    ]
    const edges = [edge("A", "B"), edge("B", "C")]
    expect(
      findUpstreamLocationFieldKeys({ nodes, edges, stepId: "s1" }),
    ).toEqual(["f1"])
  })

  test("collects every branch", () => {
    const nodes = [
      node("A", [locationStep("a1", "f1")]),
      node("B", [locationStep("b1", "f2")]),
      node("C", [action("s1")]),
    ]
    const edges = [edge("A", "C"), edge("B", "C")]
    const keys = findUpstreamLocationFieldKeys({ nodes, edges, stepId: "s1" })
    expect(keys).toHaveLength(2)
    expect(keys).toEqual(expect.arrayContaining(["f1", "f2"]))
  })

  test("ignores non-upstream steps", () => {
    const nodes = [
      node("C", [action("s1")]),
      node("D", [locationStep("d1", "f3")]),
      node("E", [locationStep("e1", "f4")]),
    ]
    const edges = [edge("C", "D")]
    expect(
      findUpstreamLocationFieldKeys({ nodes, edges, stepId: "s1" }),
    ).toEqual([])
  })

  test("ignores non-location reply formats and empty outputFieldId", () => {
    const nodes = [
      node("A", [
        { ...locationStep("a1", "f1"), replyFormat: ReplyFormat.text },
        locationStep("a2", ""),
        {
          id: "a3",
          stepType: "getUserData",
          replyFormat: ReplyFormat.location,
        },
      ]),
      node("C", [action("s1")]),
    ]
    const edges = [edge("A", "C")]
    expect(
      findUpstreamLocationFieldKeys({ nodes, edges, stepId: "s1" }),
    ).toEqual([])
  })

  test("ignores bot fields", () => {
    const nodes = [
      node("A", [locationStep("a1", "bot_field:12")]),
      node("C", [action("s1")]),
    ]
    const edges = [edge("A", "C")]
    expect(
      findUpstreamLocationFieldKeys({ nodes, edges, stepId: "s1" }),
    ).toEqual([])
  })

  test("handles cycles", () => {
    const nodes = [
      node("A", [locationStep("a1", "f1")]),
      node("B", []),
      node("C", [action("s1")]),
    ]
    const edges = [edge("A", "B"), edge("B", "C"), edge("C", "A")]
    expect(
      findUpstreamLocationFieldKeys({ nodes, edges, stepId: "s1" }),
    ).toEqual(["f1"])
  })

  test("unknown step id returns []", () => {
    const nodes = [node("A", [locationStep("a1", "f1")])]
    expect(
      findUpstreamLocationFieldKeys({ nodes, edges: [], stepId: "missing" }),
    ).toEqual([])
  })

  test("dedupes", () => {
    const nodes = [
      node("A", [locationStep("a1", "f1")]),
      node("B", [locationStep("b1", "f1")]),
      node("C", [action("s1")]),
    ]
    const edges = [edge("A", "B"), edge("B", "C")]
    expect(
      findUpstreamLocationFieldKeys({ nodes, edges, stepId: "s1" }),
    ).toEqual(["f1"])
  })

  test("counts an earlier step in the same node", () => {
    const nodes = [node("A", [locationStep("a1", "f1"), action("s1")])]
    expect(
      findUpstreamLocationFieldKeys({ nodes, edges: [], stepId: "s1" }),
    ).toEqual(["f1"])
  })

  test("ignores a later step in the same node", () => {
    const nodes = [node("A", [action("s1"), locationStep("a1", "f1")])]
    expect(
      findUpstreamLocationFieldKeys({ nodes, edges: [], stepId: "s1" }),
    ).toEqual([])
  })

  test("scans the action node fully when a cycle returns to it", () => {
    const nodes = [
      node("A", [action("s1"), locationStep("a1", "f1")]),
      node("B", []),
    ]
    const edges = [edge("A", "B"), edge("B", "A")]
    expect(
      findUpstreamLocationFieldKeys({ nodes, edges, stepId: "s1" }),
    ).toEqual(["f1"])
  })

  test("finds the source for an action in a button's steps", () => {
    const nodes = [
      node("A", [locationStep("a1", "f1")]),
      {
        id: "B",
        data: {
          details: {
            steps: [
              {
                id: "t1",
                stepType: "sendText",
                buttons: [{ id: "btn", steps: [action("s1")] }],
              },
            ],
          },
        },
      },
    ]
    const edges = [edge("A", "B")]
    expect(
      findUpstreamLocationFieldKeys({ nodes, edges, stepId: "s1" }),
    ).toEqual(["f1"])
  })

  test("finds the source for an action in a quick reply's steps", () => {
    const nodes = [
      {
        id: "B",
        data: {
          details: {
            steps: [locationStep("a1", "f1")],
            quickReplies: [{ id: "qr", steps: [action("s1")] }],
          },
        },
      },
    ]
    expect(
      findUpstreamLocationFieldKeys({ nodes, edges: [], stepId: "s1" }),
    ).toEqual(["f1"])
  })
})
