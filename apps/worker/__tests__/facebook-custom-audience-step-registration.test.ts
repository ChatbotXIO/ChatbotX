import { stepTypes } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { flowStepHandlers } from "../src/integration/handlers/step"

describe("facebookCustomAudience step dispatch registration", () => {
  test("facebookCustomAudience is registered in flowStepHandlers", () => {
    expect(flowStepHandlers).toHaveProperty(
      stepTypes.enum.facebookCustomAudience,
    )
    expect(typeof flowStepHandlers[stepTypes.enum.facebookCustomAudience]).toBe(
      "function",
    )
  })
})
