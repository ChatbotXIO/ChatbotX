import { describe, expect, test } from "vitest"
import {
  buttonStepDefaultFn,
  sendImageStepDefaultFn,
  sendMessageNodeDefaultFn,
  sendMessageNodeSchema,
  sendQuickReplyStepDefaultFn,
  sendTextStepDefaultFn,
} from "../src"

describe("sendMessage quick reply carrier validation", () => {
  test("rejects quick replies when the node has no text carrier", () => {
    const node = sendMessageNodeDefaultFn({
      nodeProps: {},
      detailProps: {
        steps: [
          {
            ...sendImageStepDefaultFn(),
            url: "https://example.com/image.png",
          },
        ],
        quickReplies: [buttonStepDefaultFn({ label: "Yes" })],
      },
    })

    const result = sendMessageNodeSchema.safeParse(node)

    expect(result.success).toBe(false)
    expect(result.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["data", "details", "quickReplies"],
          message: "flows.quickReplies.requiresTextCarrier",
        }),
      ]),
    )
  })

  test("accepts quick replies when the node has a text carrier", () => {
    const node = sendMessageNodeDefaultFn({
      nodeProps: {},
      detailProps: {
        steps: [
          sendTextStepDefaultFn({
            text: "Choose one",
          }),
        ],
        quickReplies: [buttonStepDefaultFn({ label: "Yes" })],
      },
    })

    const result = sendMessageNodeSchema.safeParse(node)

    expect(result.success).toBe(true)
  })

  test("does not default legacy sendQuickReply steps to a hardcoded prompt", () => {
    const step = sendQuickReplyStepDefaultFn()

    expect(step.message).not.toBe("Please select an option")
    expect(step.message).toBe("")
  })
})
