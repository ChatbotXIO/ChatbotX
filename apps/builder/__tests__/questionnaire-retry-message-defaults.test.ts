// @vitest-environment node
import { createTranslator } from "next-intl"
import { describe, expect, test } from "vitest"
import messages from "../messages/en.json"
import { getQuestionnaireDefaultRetryMessage } from "../src/features/questionnaires/utils/retry-message"

const t = createTranslator({ locale: "en", messages })

describe("getQuestionnaireDefaultRetryMessage", () => {
  test.each([
    ["text", "What you've entered is not a valid text. Please try again"],
    ["number", "What you've entered is not a valid number. Please try again"],
    ["email", "What you've entered is not a valid email. Please try again"],
    [
      "phone",
      "What you've entered is not a valid phone number. Please try again",
    ],
    [
      "multipleChoice",
      "What you've entered is not a valid option. Please try again",
    ],
  ] as const)("returns the %s retry message default", (type, expected) => {
    expect(getQuestionnaireDefaultRetryMessage(type, t)).toBe(expected)
  })
})
