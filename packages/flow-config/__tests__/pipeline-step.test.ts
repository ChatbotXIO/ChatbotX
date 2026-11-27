import { describe, expect, test } from "vitest"
import {
  actionSteps,
  pipelineStepActions,
  pipelineStepDefaultFn,
  pipelineStepSchema,
  stepTypes,
} from "../src"

describe("pipeline step schema", () => {
  test.each(
    pipelineStepActions.options,
  )("%s default round-trips and is an action step", (action) => {
    const base = pipelineStepDefaultFn(action, { pipelineId: "1" })
    // Defaults leave the reference pickers empty; fill them as a user would.
    const step = {
      ...base,
      ...("stageId" in base ? { stageId: "2" } : {}),
      ...("pipelineFieldId" in base ? { pipelineFieldId: "3" } : {}),
      ...("destinationPipelineId" in base
        ? { destinationPipelineId: "4" }
        : {}),
    } as typeof base
    expect(step.stepType).toBe(stepTypes.enum.pipeline)
    expect(step.action).toBe(action)
    expect(pipelineStepSchema.parse(step)).toEqual(step)
    expect(actionSteps.some((schema) => schema.safeParse(step).success)).toBe(
      true,
    )
  })

  test("carries id, pipeline and routing states across an action switch", () => {
    const first = pipelineStepDefaultFn("addToPipeline", { pipelineId: "9" })
    const next = pipelineStepDefaultFn("moveToStage", {
      id: first.id,
      pipelineId: first.pipelineId,
      states: first.states,
    })
    expect(next.id).toBe(first.id)
    expect(next.states).toBe(first.states)
    expect(next.states.map((state) => state.stateType)).toEqual([
      "success",
      "error",
      "skip",
    ])
  })

  test("rejects an unknown action, missing action fields and a wrong state tuple", () => {
    const step = pipelineStepDefaultFn("moveToStage", { pipelineId: "1" })
    expect(
      pipelineStepSchema.safeParse({ ...step, action: "nope" }).success,
    ).toBe(false)
    const { stageId: _stageId, ...withoutStage } = step as typeof step & {
      stageId: string
    }
    expect(pipelineStepSchema.safeParse(withoutStage).success).toBe(false)
    expect(
      pipelineStepSchema.safeParse({ ...step, states: [step.states[0]] })
        .success,
    ).toBe(false)
  })

  test("validates the due date modes", () => {
    const base = pipelineStepDefaultFn("changeDueDate", { pipelineId: "1" })
    const parse = (dueDate: unknown) =>
      pipelineStepSchema.safeParse({ ...base, dueDate }).success
    expect(parse({ mode: "none" })).toBe(true)
    expect(parse({ mode: "customField", customFieldId: "123" })).toBe(true)
    expect(parse({ mode: "fixed", at: "2026-01-01T00:00:00Z" })).toBe(true)
    expect(parse({ mode: "fixed", at: "tomorrow" })).toBe(false)
    expect(parse({ mode: "customField" })).toBe(false)
    expect(parse({ mode: "customField", customFieldId: "" })).toBe(true)
    expect(parse({ mode: "customField", customFieldId: "abc" })).toBe(false)
    expect(parse({ mode: "customField", customFieldId: "1".repeat(19) })).toBe(
      false,
    )
  })

  test("enforces text and list limits", () => {
    const title = pipelineStepDefaultFn("changeTitle", { pipelineId: "1" })
    expect(
      pipelineStepSchema.safeParse({ ...title, title: "x".repeat(201) })
        .success,
    ).toBe(false)
    const comment = pipelineStepDefaultFn("addComment", { pipelineId: "1" })
    expect(
      pipelineStepSchema.safeParse({ ...comment, text: "x".repeat(2001) })
        .success,
    ).toBe(false)
    const assign = pipelineStepDefaultFn("assign", { pipelineId: "1" })
    expect(
      pipelineStepSchema.safeParse({
        ...assign,
        assigneeMemberIds: Array.from({ length: 21 }, (_, i) => String(i)),
      }).success,
    ).toBe(false)
  })

  test("rejects empty or non-numeric reference ids", () => {
    const move = pipelineStepDefaultFn("moveToStage", { pipelineId: "1" })
    const ok = { ...move, stageId: "2" }
    expect(pipelineStepSchema.safeParse(ok).success).toBe(true)
    for (const bad of [
      { ...ok, pipelineId: "abc" },
      { ...ok, pipelineId: "" },
      { ...ok, stageId: "" },
      { ...ok, stageId: "1; drop" },
      { ...ok, pipelineId: "1".repeat(19) },
    ]) {
      expect(pipelineStepSchema.safeParse(bad).success).toBe(false)
    }
    const assign = pipelineStepDefaultFn("assign", { pipelineId: "1" })
    expect(
      pipelineStepSchema.safeParse({ ...assign, assigneeMemberIds: ["x"] })
        .success,
    ).toBe(false)
    expect(
      pipelineStepSchema.safeParse({ ...assign, assigneeInboxTeamIds: ["5"] })
        .success,
    ).toBe(true)
    const add = pipelineStepDefaultFn("addToPipeline", { pipelineId: "1" })
    expect(pipelineStepSchema.safeParse({ ...add, stageId: "" }).success).toBe(
      true,
    )
    expect(
      pipelineStepSchema.safeParse({ ...add, stageId: "nope" }).success,
    ).toBe(false)
  })

  test("destination stage and custom field ids are bigint-like or empty", () => {
    const transfer = pipelineStepDefaultFn("transfer", { pipelineId: "1" })
    const ok = { ...transfer, destinationPipelineId: "2" }
    for (const destinationStageId of [undefined, "", "7"]) {
      expect(
        pipelineStepSchema.safeParse({ ...ok, destinationStageId }).success,
      ).toBe(true)
    }
    expect(
      pipelineStepSchema.safeParse({ ...ok, destinationStageId: "x" }).success,
    ).toBe(false)
    const field = pipelineStepDefaultFn("setCustomField", { pipelineId: "1" })
    expect(pipelineStepSchema.safeParse(field).success).toBe(true)
    expect(
      pipelineStepSchema.safeParse({ ...field, pipelineFieldId: "x" }).success,
    ).toBe(false)
  })
})
