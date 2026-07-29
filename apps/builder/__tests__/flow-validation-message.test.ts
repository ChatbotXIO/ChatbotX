import { flowValidationCodes } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { z } from "zod"
import { resolveFlowValidationMessageKey } from "@/features/flows/react-flow/flow-validation-message"

const makeValidationError = (message: string) => {
  const schema = z.string().superRefine((_value, ctx) => {
    ctx.addIssue({ code: "custom", message })
  })
  const result = schema.safeParse("value")

  if (result.success) {
    throw new Error("Expected test schema to fail")
  }

  return result.error
}

describe("resolveFlowValidationMessageKey", () => {
  test("maps a known flow validation code to its localized message key", () => {
    const error = makeValidationError(
      flowValidationCodes.whatsappCarouselButtonsMismatch,
    )

    expect(resolveFlowValidationMessageKey(error)).toBe(
      "messages.whatsappCarouselButtonsMismatch",
    )
  })

  test("falls back for unrelated validation issues", () => {
    const error = makeValidationError("Required")

    expect(resolveFlowValidationMessageKey(error)).toBe(
      "messages.flowConfigIncomplete",
    )
  })
})
