import { describe, expect, test } from "vitest"
import { publishFlowSchema, sendMessageNodeDefaultFn } from "../src"
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

describe("getUserDataStepSchema — auto skip and skip button defaults", () => {
  const sparseNode = {
    id: "1783440960229",
    stepType: "getUserData",
    message: "What is your email?",
    replyFormat: ReplyFormat.email,
    outputFieldId: "field-1",
    states: getUserDataStepDefaultFn().states,
  }

  test("a public API node can omit every optional knob", () => {
    const result = getUserDataStepSchema.safeParse(sparseNode)

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({
      retryMessage: "",
      skipButtonLabel: "Skip",
      autoSkip: false,
      autoSkipTimeUnit: "minutes",
      autoSkipTimeValue: 3,
      autoSkipFailAttempts: 3,
    })
  })

  test("keeps stored values, including an empty skip button label", () => {
    const result = getUserDataStepSchema.safeParse({
      ...sparseNode,
      skipButtonLabel: "",
      autoSkip: true,
      autoSkipTimeUnit: "seconds",
      autoSkipTimeValue: "30",
      autoSkipFailAttempts: 2,
    })

    expect(result.data).toMatchObject({
      skipButtonLabel: "",
      autoSkip: true,
      autoSkipTimeUnit: "seconds",
      autoSkipTimeValue: 30,
      autoSkipFailAttempts: 2,
    })
  })

  test("still accepts a long stored label (clamped only on the wire)", () => {
    const result = getUserDataStepSchema.safeParse({
      ...sparseNode,
      skipButtonLabel: "x".repeat(255),
    })

    expect(result.success).toBe(true)
  })

  test("defaultFn takes the builder's UI-language label but never its id", () => {
    const step = getUserDataStepDefaultFn({
      skipButtonLabel: "Bỏ qua",
      id: "1",
    })

    expect(step.skipButtonLabel).toBe("Bỏ qua")
    expect(step.id).not.toBe("1")
    expect(getUserDataStepDefaultFn().skipButtonLabel).toBe("Skip")
  })
})

describe("Get User Data in a published graph (public API)", () => {
  const sparseStep = {
    id: "1783440960229",
    stepType: "getUserData",
    message: "What is your email?",
    replyFormat: ReplyFormat.email,
    outputFieldId: "field-1",
    states: getUserDataStepDefaultFn().states,
  }

  function publishWith(step: Record<string, unknown>) {
    const node = sendMessageNodeDefaultFn({ nodeProps: { id: "1" } })
    return publishFlowSchema.safeParse({
      nodes: [
        {
          ...node,
          data: {
            ...node.data,
            details: { ...node.data.details, steps: [step] },
          },
        },
      ],
      edges: [],
    })
  }

  test("an agent can omit every optional knob and still publish", () => {
    const result = publishWith(sparseStep)

    expect(result.success).toBe(true)
  })

  test("the omitted knobs arrive with their defaults (Skip button on, Auto Skip off)", () => {
    const result = publishWith(sparseStep)

    const published = result.data?.nodes[0]?.data.details as {
      steps: Record<string, unknown>[]
    }
    expect(published.steps[0]).toMatchObject({
      skipButtonLabel: "Skip",
      autoSkip: false,
      autoSkipTimeUnit: "minutes",
      autoSkipTimeValue: 3,
      autoSkipFailAttempts: 3,
      retryMessage: "",
    })
  })

  test("an out-of-range knob is still rejected", () => {
    const result = publishWith({ ...sparseStep, autoSkipTimeValue: 0 })

    expect(result.success).toBe(false)
  })
})
