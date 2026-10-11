import { describe, expect, test } from "vitest"
import {
  decodeContactHintQuickReplyPayload,
  encodeContactHintQuickReplyPayload,
  getUserDataStepDefaultFn,
  getUserDataStepSchema,
  ReplyFormat,
} from "../src/steps/get-user-data"
import { decodeButtonPayload } from "../src/util"

function makeStep(overrides: Record<string, unknown> = {}) {
  return {
    ...getUserDataStepDefaultFn(),
    message: "What is your phone number?",
    replyFormat: ReplyFormat.phone,
    outputFieldId: "field-1",
    ...overrides,
  }
}

describe("getUserDataStepSchema — showHint", () => {
  test("defaults showHint to false", () => {
    expect(getUserDataStepDefaultFn().showHint).toBe(false)
  })

  test("accepts showHint true", () => {
    const result = getUserDataStepSchema.safeParse(makeStep({ showHint: true }))

    expect(result.success).toBe(true)
    expect(result.data?.showHint).toBe(true)
  })

  test("accepts a saved step without showHint", () => {
    const { showHint: _showHint, ...legacyStep } = makeStep()

    const result = getUserDataStepSchema.safeParse(legacyStep)

    expect(result.success).toBe(true)
    expect(result.data?.showHint).toBeUndefined()
  })

  test("rejects a non-boolean showHint", () => {
    const result = getUserDataStepSchema.safeParse(
      makeStep({ showHint: "yes" }),
    )

    expect(result.success).toBe(false)
  })
})

describe("contact hint quick reply payload", () => {
  test("round-trips the full value", () => {
    const payload = encodeContactHintQuickReplyPayload(
      "taubancam171995.1@gmail.com",
    )

    expect(decodeContactHintQuickReplyPayload(payload)).toBe(
      "taubancam171995.1@gmail.com",
    )
  })

  test("returns null for other payloads, empty values and null", () => {
    expect(decodeContactHintQuickReplyPayload("1234567890123")).toBeNull()
    expect(
      decodeContactHintQuickReplyPayload(
        encodeContactHintQuickReplyPayload(""),
      ),
    ).toBeNull()
    expect(decodeContactHintQuickReplyPayload(null)).toBeNull()
  })

  test("is never decodable as a flow action", () => {
    for (const value of ["0708122593", "1234567890123", "a:b@example.com"]) {
      const payload = encodeContactHintQuickReplyPayload(value)

      expect(decodeButtonPayload(payload, { allowBareFlowId: true })).toBeNull()
    }
  })
})
