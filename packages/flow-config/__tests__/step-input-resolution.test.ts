import { describe, expect, test } from "vitest"
import { metadataSchema } from "../src/nodes/send-message"
import {
  decodeStepInputSkipPostback,
  encodeStepInputSkipPostback,
  STEP_INPUT_RESOLUTION_PAYLOAD_TYPE,
  stepInputResolutionReasons,
} from "../src/step-input-resolution"
import { decodeButtonPayload } from "../src/util"

const CHALLENGE_ID = "11612473309626368"

describe("step input skip postback codec", () => {
  test("round-trips a challenge id", () => {
    const payload = encodeStepInputSkipPostback(CHALLENGE_ID)

    expect(decodeStepInputSkipPostback(payload)).toBe(CHALLENGE_ID)
  })

  test("fits Telegram's 64-byte callback_data with the largest id", () => {
    const payload = encodeStepInputSkipPostback("9223372036854775807")

    expect(Buffer.byteLength(payload)).toBeLessThanOrEqual(64)
    expect(decodeStepInputSkipPostback(payload)).toBe("9223372036854775807")
  })

  test("is never readable as a flow button payload", () => {
    const payload = encodeStepInputSkipPostback(CHALLENGE_ID)

    expect(payload.includes(":")).toBe(false)
    expect(decodeButtonPayload(payload)).toBeNull()
    expect(decodeButtonPayload(payload, { allowBareFlowId: true })).toBeNull()
  })

  test.each([
    ["null", null],
    ["undefined", undefined],
    ["empty", ""],
    ["unrelated text", "hello"],
    ["a flow button payload", "123:456:789"],
    ["missing id", "STEP_INPUT_SKIP|"],
    ["non-numeric id", "STEP_INPUT_SKIP|abc"],
    ["id with trailing text", "STEP_INPUT_SKIP|123 foo"],
    ["negative id", "STEP_INPUT_SKIP|-1"],
    [
      "id beyond the signed bigint range",
      "STEP_INPUT_SKIP|9223372036854775808",
    ],
    ["id with 20 digits", "STEP_INPUT_SKIP|12345678901234567890"],
    ["prefix not at the start", "x STEP_INPUT_SKIP|123"],
  ])("rejects %s", (_label, payload) => {
    expect(decodeStepInputSkipPostback(payload)).toBeNull()
  })
})

describe("step input resolution payload", () => {
  test("only allows reasons that need no typed answer", () => {
    expect(stepInputResolutionReasons.options).toEqual([
      "timeout",
      "user_skipped",
    ])
    expect(
      stepInputResolutionReasons.safeParse("invalid_input_attempts").success,
    ).toBe(false)
  })

  test("is accepted by the metadata union", () => {
    const parsed = metadataSchema.safeParse({
      type: STEP_INPUT_RESOLUTION_PAYLOAD_TYPE,
      stepId: "1",
      challengeId: CHALLENGE_ID,
      reason: "timeout",
    })

    expect(parsed.success).toBe(true)
  })

  test("is rejected without a challenge id or with an unknown reason", () => {
    const base = {
      type: STEP_INPUT_RESOLUTION_PAYLOAD_TYPE,
      stepId: "1",
      challengeId: CHALLENGE_ID,
      reason: "timeout",
    }

    expect(
      metadataSchema.safeParse({ ...base, challengeId: undefined }).success,
    ).toBe(false)
    expect(metadataSchema.safeParse({ ...base, reason: "x" }).success).toBe(
      false,
    )
  })
})
