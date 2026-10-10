import { describe, expect, test } from "vitest"
import {
  flowValidationCodes,
  whatsappFlowStepDefaultFn,
  whatsappFlowStepSchema,
} from "../src"

const completeStep = () =>
  whatsappFlowStepDefaultFn({
    text: "Fill in the form",
    inboxId: "11",
    flow: {
      id: "22",
      sourceId: "1234567890",
      startScreenId: "WELCOME",
      fieldMappings: [],
    },
  })

const issues = (step: unknown) => {
  const result = whatsappFlowStepSchema.safeParse(step)
  return result.success ? [] : result.error.issues
}

const issueMessages = (step: unknown) =>
  issues(step).map((issue) => issue.message)

describe("whatsappFlowStepSchema", () => {
  test("accepts a step whose dialog was completed", () => {
    expect(whatsappFlowStepSchema.safeParse(completeStep()).success).toBe(true)
  })

  test("accepts an empty sourceId: the worker resolves it from flow.id", () => {
    const step = completeStep()
    step.flow = { ...step.flow, sourceId: "" }
    expect(whatsappFlowStepSchema.safeParse(step).success).toBe(true)
  })

  test("rejects a step with no WhatsApp Flow picked, once, on flow", () => {
    const step = completeStep()
    step.flow = { ...step.flow, id: null, sourceId: "", startScreenId: null }
    expect(
      issues(step).map((issue) => ({
        path: issue.path,
        message: issue.message,
      })),
    ).toEqual([
      { path: ["flow"], message: flowValidationCodes.whatsappFlowIncomplete },
    ])
  })

  test("rejects a step with no start screen picked", () => {
    const step = completeStep()
    step.flow = { ...step.flow, startScreenId: null }
    expect(issueMessages(step)).toEqual([
      flowValidationCodes.whatsappFlowIncomplete,
    ])
  })

  test("a new step starts incomplete", () => {
    expect(issueMessages(whatsappFlowStepDefaultFn())).toContain(
      flowValidationCodes.whatsappFlowIncomplete,
    )
  })
})
