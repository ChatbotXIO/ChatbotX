import { stepTypes } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { MESSAGE_PRODUCING_STEP_TYPES } from "../src/integration/handlers/flow-utils"
import { flowStepHandlers } from "../src/integration/handlers/step"

describe("sendMultipleImages step dispatch registration", () => {
  test("sendMultipleImages is registered in flowStepHandlers", () => {
    expect(flowStepHandlers).toHaveProperty(stepTypes.enum.sendMultipleImages)
    expect(typeof flowStepHandlers[stepTypes.enum.sendMultipleImages]).toBe(
      "function",
    )
  })

  test("sendMultipleImages is in MESSAGE_PRODUCING_STEP_TYPES, matching its flowStepHandlers entry", () => {
    expect(
      MESSAGE_PRODUCING_STEP_TYPES.has(stepTypes.enum.sendMultipleImages),
    ).toBe(true)
  })
})
