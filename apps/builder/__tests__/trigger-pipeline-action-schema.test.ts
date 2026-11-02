import { describe, expect, test } from "vitest"
import { allActions } from "@/features/triggers/components/actions/schema"
import {
  defaultFn,
  pipeline,
} from "@/features/triggers/components/actions/schema/pipeline"
import { updateTriggerSchema } from "@/features/triggers/schema/mutation"

describe("trigger pipeline action schema", () => {
  test("is part of the actions a trigger can store", () => {
    expect(allActions.pipeline).toBe(pipeline)
  })

  test("the default starts as an add-to-pipeline with nothing picked yet", () => {
    expect(defaultFn()).toMatchObject({
      type: "pipeline",
      action: "addToPipeline",
      pipelineId: "",
    })
    expect(pipeline.safeParse(defaultFn()).success).toBe(false)
  })

  test("a complete action is accepted", () => {
    expect(
      pipeline.safeParse({
        type: "pipeline",
        pipelineId: "101",
        action: "moveToStage",
        stageId: "201",
      }).success,
    ).toBe(true)
  })

  test("a trigger can store pipeline and external-step actions with the others", () => {
    const result = updateTriggerSchema.safeParse({
      conditions: [],
      actions: [
        { type: "pipeline", pipelineId: "101", action: "removeFromPipeline" },
        { type: "startExternalStep", flowId: "11", nodeId: "22" },
        { type: "addTag", tagIds: ["1"] },
      ],
    })

    expect(result.success).toBe(true)
  })

  test("an incomplete pipeline action is rejected", () => {
    const result = updateTriggerSchema.safeParse({
      conditions: [],
      actions: [{ type: "pipeline", pipelineId: "101", action: "moveToStage" }],
    })

    expect(result.success).toBe(false)
  })
})
