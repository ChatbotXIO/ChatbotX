import { flowValidationCodes } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { z } from "zod"
import { resolveFlowValidationMessageKey } from "@/features/flows/react-flow/flow-validation-message"

const makeValidationError = (message: string, capability?: unknown) => {
  const schema = z.string().superRefine((_value, ctx) => {
    ctx.addIssue({
      code: "custom",
      message,
      params: capability ? { capability } : undefined,
    })
  })
  const result = schema.safeParse("value")

  if (result.success) {
    throw new Error("Expected test schema to fail")
  }

  return result.error
}

describe("resolveFlowValidationMessageKey", () => {
  test.each([
    flowValidationCodes.unsupportedBlock,
    flowValidationCodes.constraintExceeded,
  ])("maps %s to its localized message key", (code) => {
    const error = makeValidationError(code)

    expect(resolveFlowValidationMessageKey(error)).toBe(`messages.${code}`)
  })

  test("maps a descriptive issue with a capability code to its localized message key", () => {
    const error = makeValidationError(
      "The instagram channel does not support sendCard.",
      { code: flowValidationCodes.unsupportedBlock },
    )

    expect(resolveFlowValidationMessageKey(error)).toBe(
      "messages.unsupportedBlock",
    )
  })

  test("falls back for unrelated validation issues", () => {
    const error = makeValidationError("Required")

    expect(resolveFlowValidationMessageKey(error)).toBe(
      "messages.flowConfigIncomplete",
    )
  })
})
