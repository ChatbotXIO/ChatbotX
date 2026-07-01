import type { ButtonStepProps } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { convertFlowStepText } from "../src/handlers/message/outgoing-message/send-text"

const quickReplies: ButtonStepProps[] = [
  { id: "qr-1", label: "Yes", buttonType: null, beforeStep: null, steps: [] },
]

describe("messenger quick replies attachment", () => {
  test("attaches node quick replies to plain text as quick reply chips", () => {
    const [payload] = Array.from(
      convertFlowStepText({
        data: {
          contact: { id: "ci-1" },
          flowId: "flow-1",
          step: {
            id: "step-1",
            stepType: "sendText",
            text: "Choose",
            buttons: [],
          },
          quickReplies,
        },
      } as never),
    )

    expect(payload).toEqual(
      expect.objectContaining({
        text: "Choose",
        quick_replies: [
          expect.objectContaining({ title: "Yes", content_type: "text" }),
        ],
      }),
    )
  })

  test("does not attach node quick replies when text already renders a button template", () => {
    const [payload] = Array.from(
      convertFlowStepText({
        data: {
          contact: { id: "ci-1" },
          flowId: "flow-1",
          step: {
            id: "step-1",
            stepType: "sendText",
            text: "Choose",
            buttons: [
              {
                id: "btn-1",
                label: "Existing",
                buttonType: null,
                beforeStep: null,
                steps: [],
              },
            ],
          },
          quickReplies,
        },
      } as never),
    )

    expect(payload).toEqual(
      expect.objectContaining({
        attachment: expect.objectContaining({
          payload: expect.objectContaining({
            template_type: "button",
            buttons: [expect.objectContaining({ title: "Existing" })],
          }),
        }),
      }),
    )
    expect(payload).not.toHaveProperty("quick_replies")
  })
})
