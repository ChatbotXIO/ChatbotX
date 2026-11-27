import { describe, expect, test } from "vitest"
import { allActions } from "@/features/triggers/components/actions/schema"
import {
  defaultFn,
  startExternalStep,
} from "@/features/triggers/components/actions/schema/start-external-step"

describe("trigger startExternalStep action schema", () => {
  test("accepts a flow id and a node id", () => {
    expect(
      startExternalStep.safeParse({
        ...defaultFn(),
        flowId: "11",
        nodeId: "22",
      }).success,
    ).toBe(true)
  })

  test.each([
    ["the empty defaults (nothing picked yet)", defaultFn()],
    ["a missing node id", { type: "startExternalStep", flowId: "11" }],
    [
      "non-numeric ids",
      { type: "startExternalStep", flowId: "a", nodeId: "b" },
    ],
    [
      "another action type",
      { type: "startAnotherFlow", flowId: "1", nodeId: "2" },
    ],
  ])("rejects %s", (_label, action) => {
    expect(startExternalStep.safeParse(action).success).toBe(false)
  })

  test("is part of the actions a trigger can store", () => {
    expect(allActions.startExternalStep).toBe(startExternalStep)
  })
})
