import { describe, expect, test } from "vitest"
import { CHANNEL_FLOW_POLICIES } from "../src/channel-rules/policies"
import { performActionNodeDefaultFn } from "../src/nodes/perform-action"
import { publishFlowSchema } from "../src/publish-schema"
import {
  AI_SEGMENT_IMAGE_TARGET_MAX_LENGTH,
  aiSegmentImageDefaultFn,
  aiSegmentImageSchema,
} from "../src/steps/ai-segment-image"
import { stepTypes } from "../src/steps/step-action"

const validStep = () =>
  aiSegmentImageDefaultFn({
    inputFieldId: "1",
    target: "product box",
    outputFieldId: "2",
  })

describe("aiSegmentImage step", () => {
  test("defaults to largest match and success/skip/error states", () => {
    const step = aiSegmentImageDefaultFn()

    expect(step.stepType).toBe(stepTypes.enum.aiSegmentImage)
    expect(step.matchSelection).toBe("largest")
    expect(step.inputFieldId).toBe("")
    expect(step.outputFieldId).toBe("")
    expect(step.detailsOutputFieldId).toBeUndefined()
    expect(step.states.map((state) => state.stateType)).toEqual([
      "success",
      "skip",
      "error",
    ])
  })

  test("accepts every setting", () => {
    const parsed = aiSegmentImageSchema.parse({
      ...validStep(),
      matchSelection: "all",
      detailsOutputFieldId: "3",
    })

    expect(parsed).toMatchObject({
      matchSelection: "all",
      detailsOutputFieldId: "3",
    })
  })

  test("accepts no details output", () => {
    expect(aiSegmentImageSchema.safeParse(validStep()).success).toBe(true)
  })

  test("accepts replacing the source image with the output", () => {
    const result = aiSegmentImageSchema.safeParse({
      ...validStep(),
      outputFieldId: "1",
    })

    expect(result.success).toBe(true)
  })

  test("rejects missing fields", () => {
    expect(
      aiSegmentImageSchema.safeParse(aiSegmentImageDefaultFn()).success,
    ).toBe(false)
    expect(
      aiSegmentImageSchema.safeParse({ ...validStep(), inputFieldId: "" })
        .success,
    ).toBe(false)
    expect(
      aiSegmentImageSchema.safeParse({ ...validStep(), outputFieldId: "" })
        .success,
    ).toBe(false)
  })

  test("rejects a whitespace or overlong target", () => {
    expect(
      aiSegmentImageSchema.safeParse({ ...validStep(), target: "   " }).success,
    ).toBe(false)
    expect(
      aiSegmentImageSchema.safeParse({
        ...validStep(),
        target: "a".repeat(AI_SEGMENT_IMAGE_TARGET_MAX_LENGTH + 1),
      }).success,
    ).toBe(false)
  })

  test("trims the target", () => {
    const parsed = aiSegmentImageSchema.parse({
      ...validStep(),
      target: "  red car  ",
    })

    expect(parsed.target).toBe("red car")
  })

  test("rejects an invalid match selection", () => {
    expect(
      aiSegmentImageSchema.safeParse({
        ...validStep(),
        matchSelection: "first",
      }).success,
    ).toBe(false)
  })

  test("drops the outputFormat key of steps saved before crop-only output", () => {
    const parsed = aiSegmentImageSchema.parse({
      ...validStep(),
      outputFormat: "mask",
    })

    expect(parsed).not.toHaveProperty("outputFormat")
  })

  test("rejects details sharing the output image field", () => {
    const result = aiSegmentImageSchema.safeParse({
      ...validStep(),
      detailsOutputFieldId: "2",
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["detailsOutputFieldId"])
  })

  test("rejects details sharing the source image field", () => {
    const result = aiSegmentImageSchema.safeParse({
      ...validStep(),
      detailsOutputFieldId: "1",
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["detailsOutputFieldId"])
  })

  test("rejects states in the wrong order", () => {
    const step = validStep()
    const [success, skip, error] = step.states

    expect(
      aiSegmentImageSchema.safeParse({
        ...step,
        states: [success, error, skip],
      }).success,
    ).toBe(false)
  })

  test("is accepted inside a published flow", () => {
    const node = performActionNodeDefaultFn({
      detailProps: { steps: [validStep()] },
    })

    expect(
      publishFlowSchema.safeParse({ nodes: [node], edges: [] }).success,
    ).toBe(true)
  })

  test("a malformed step fails published flow validation", () => {
    const node = performActionNodeDefaultFn({
      detailProps: {
        steps: [{ ...validStep(), detailsOutputFieldId: "2" }],
      },
    })

    expect(
      publishFlowSchema.safeParse({ nodes: [node], edges: [] }).success,
    ).toBe(false)
  })

  test("accepts account-field (bot field) references in every field slot", () => {
    const parsed = aiSegmentImageSchema.safeParse({
      ...validStep(),
      inputFieldId: "bot_field:11",
      outputFieldId: "bot_field:12",
      detailsOutputFieldId: "bot_field:13",
    })

    expect(parsed.success).toBe(true)
  })

  test.each([
    "inputFieldId",
    "outputFieldId",
    "detailsOutputFieldId",
  ])("rejects a malformed bot field token in %s", (field) => {
    expect(
      aiSegmentImageSchema.safeParse({
        ...validStep(),
        [field]: "bot_field:abc",
      }).success,
    ).toBe(false)
  })

  test("rejects bot field tokens that collide like plain ids", () => {
    expect(
      aiSegmentImageSchema.safeParse({
        ...validStep(),
        outputFieldId: "bot_field:12",
        detailsOutputFieldId: "bot_field:12",
      }).success,
    ).toBe(false)
  })

  test("accepts a target of exactly the maximum length", () => {
    expect(
      aiSegmentImageSchema.safeParse({
        ...validStep(),
        target: "a".repeat(AI_SEGMENT_IMAGE_TARGET_MAX_LENGTH),
      }).success,
    ).toBe(true)
  })

  test("rejects an empty-string details field instead of treating it as unset", () => {
    expect(
      aiSegmentImageSchema.safeParse({
        ...validStep(),
        detailsOutputFieldId: "",
      }).success,
    ).toBe(false)
  })

  test("requires the states tuple", () => {
    const { states: _states, ...withoutStates } = validStep()

    expect(aiSegmentImageSchema.safeParse(withoutStates).success).toBe(false)
  })

  test("rejects a wrong step type discriminator", () => {
    expect(
      aiSegmentImageSchema.safeParse({
        ...validStep(),
        stepType: "aiEditImage",
      }).success,
    ).toBe(false)
  })

  test("drops provider/model keys instead of persisting them", () => {
    const parsed = aiSegmentImageSchema.parse({
      ...validStep(),
      model: "sam-3",
      provider: "openai",
    })

    expect(parsed).not.toHaveProperty("provider")
    expect(parsed).not.toHaveProperty("model")
  })

  test("defaults give every state a distinct id", () => {
    const ids = aiSegmentImageDefaultFn().states.map((state) => state.id)

    expect(new Set(ids).size).toBe(3)
  })

  test("caller props cannot override the step type or the states", () => {
    const step = aiSegmentImageDefaultFn({
      stepType: "aiEditImage" as never,
      states: [] as never,
    })

    expect(step.stepType).toBe(stepTypes.enum.aiSegmentImage)
    expect(step.states).toHaveLength(3)
  })

  test("runs on the worker, so every channel supports it", () => {
    for (const policy of Object.values(CHANNEL_FLOW_POLICIES)) {
      expect(policy.steps.aiSegmentImage).toBe("full")
    }
  })

  test("a published flow keeps the segment step next to other actions", () => {
    const node = performActionNodeDefaultFn({
      detailProps: {
        steps: [validStep(), { ...validStep(), outputFieldId: "1" }],
      },
    })

    const result = publishFlowSchema.safeParse({ nodes: [node], edges: [] })
    expect(result.success).toBe(true)
    const steps =
      result.success && result.data.nodes[0]?.type === "performAction"
        ? result.data.nodes[0].data.details.steps
        : []
    expect(steps.map((step) => step.stepType)).toEqual([
      "aiSegmentImage",
      "aiSegmentImage",
    ])
  })
})
