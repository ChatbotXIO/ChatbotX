import { aiSegmentImageDefaultFn, stepTypes } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const INLINE_KEY_PATTERN = /^flow-inline-/

const mocks = vi.hoisted(() => ({ runViaHeavyWorker: vi.fn() }))

vi.mock(
  "../src/integration/handlers/heavy-step-runner",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../src/integration/handlers/heavy-step-runner")
    >()),
    runViaHeavyWorker: mocks.runViaHeavyWorker,
  }),
)

const { flowStepHandlers } = await import("../src/integration/handlers/step")
const { MESSAGE_PRODUCING_STEP_TYPES, STEP_PRODUCES_MESSAGE } = await import(
  "../src/integration/handlers/flow-utils"
)

describe("aiSegmentImage step dispatch registration", () => {
  beforeEach(() => {
    mocks.runViaHeavyWorker.mockResolvedValue({ result: null, status: "wait" })
  })

  test("hands the step to the heavy worker and pauses the flow", async () => {
    const handler = flowStepHandlers[stepTypes.enum.aiSegmentImage]
    const step = aiSegmentImageDefaultFn({
      id: "9",
      inputFieldId: "1",
      outputFieldId: "2",
      target: "product box",
    })

    const result = await handler?.({
      conversation: { id: "conversation-1" },
      contactInbox: { id: "contact-inbox-1" },
      flowExecutionKey: "flow-execution-1",
      step,
    } as never)

    expect(result).toEqual({ result: null, status: "wait" })
    expect(mocks.runViaHeavyWorker).toHaveBeenCalledWith(
      "aiSegmentImage",
      expect.objectContaining({ flowExecutionKey: "flow-execution-1", step }),
    )
  })

  test("mints a fallback execution key when the caller has none", async () => {
    const handler = flowStepHandlers[stepTypes.enum.aiSegmentImage]

    await handler?.({
      conversation: { id: "conversation-1" },
      contactInbox: { id: "contact-inbox-1" },
      step: aiSegmentImageDefaultFn({ id: "9" }),
    } as never)

    expect(mocks.runViaHeavyWorker).toHaveBeenCalledWith(
      "aiSegmentImage",
      expect.objectContaining({
        flowExecutionKey: expect.stringMatching(INLINE_KEY_PATTERN),
      }),
    )
  })

  test("never claims a comment anchor: it sends no message itself", () => {
    expect(STEP_PRODUCES_MESSAGE.aiSegmentImage).toBe(false)
    expect(
      MESSAGE_PRODUCING_STEP_TYPES.has(stepTypes.enum.aiSegmentImage),
    ).toBe(false)
  })
})
