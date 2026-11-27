import { describe, expect, test } from "vitest"
import {
  pipelineActionDefaultFn,
  pipelineActionSchema,
  pipelineStepActions,
  pipelineStepDefaultFn,
  pipelineStepSchema,
} from "../src"

/** Fills the reference pickers a user would pick, which the defaults leave empty. */
const filled = <T extends object>(base: T): T =>
  ({
    ...base,
    ...("stageId" in base ? { stageId: "2" } : {}),
    ...("pipelineFieldId" in base ? { pipelineFieldId: "3" } : {}),
    ...("destinationPipelineId" in base ? { destinationPipelineId: "4" } : {}),
  }) as T

describe("pipeline trigger action schema", () => {
  test("both unions cover exactly the same actions", () => {
    const options = (schema: { options: readonly { shape: unknown }[] }) =>
      schema.options
        .map(
          (option) =>
            (option.shape as { action: { value: string } }).action.value,
        )
        .sort()

    expect(options(pipelineActionSchema)).toEqual(
      [...pipelineStepActions.options].sort(),
    )
    expect(options(pipelineStepSchema)).toEqual(
      [...pipelineStepActions.options].sort(),
    )
  })

  test.each(
    pipelineStepActions.options,
  )("%s default round-trips as a trigger action without the step envelope", (action) => {
    const base = pipelineActionDefaultFn(action, { pipelineId: "1" })
    const trigger = filled(base)

    expect(trigger.type).toBe("pipeline")
    expect(trigger.action).toBe(action)
    expect(trigger).not.toHaveProperty("id")
    expect(trigger).not.toHaveProperty("states")
    expect(trigger).not.toHaveProperty("stepType")
    expect(pipelineActionSchema.parse(trigger)).toEqual(trigger)
  })

  test.each(
    pipelineStepActions.options,
  )("%s shares its fields with the flow step", (action) => {
    const step = filled(pipelineStepDefaultFn(action, { pipelineId: "1" }))
    const { id, stepType, states, ...fields } = step

    expect(
      pipelineActionSchema.safeParse({ ...fields, type: "pipeline" }).success,
    ).toBe(true)
    expect(pipelineStepSchema.safeParse(step).success).toBe(true)
  })

  test("a stored flow step still parses exactly as before", () => {
    const stored = {
      id: "1",
      stepType: "pipeline",
      pipelineId: "10",
      action: "addToPipeline",
      title: "{{full_name}}",
      description: "",
      assigneeMemberIds: [],
      assigneeInboxTeamIds: [],
      status: "open",
      dueDate: { mode: "none" },
      fieldValues: [{ pipelineFieldId: "5", value: "{{email}}" }],
      states: pipelineStepDefaultFn().states,
    }

    expect(pipelineStepSchema.parse(stored)).toEqual(stored)
  })

  test.each([
    [
      "an unknown action",
      { type: "pipeline", pipelineId: "1", action: "nope" },
    ],
    [
      "another action type",
      { type: "addTag", pipelineId: "1", action: "removeFromPipeline" },
    ],
    ["a missing pipeline", { type: "pipeline", action: "removeFromPipeline" }],
    [
      "a negative-limit title",
      {
        type: "pipeline",
        pipelineId: "1",
        action: "changeTitle",
        title: "x".repeat(201),
      },
    ],
    [
      "a move without a stage",
      { type: "pipeline", pipelineId: "1", action: "moveToStage" },
    ],
  ])("rejects %s", (_label, action) => {
    expect(pipelineActionSchema.safeParse(action).success).toBe(false)
  })
})
