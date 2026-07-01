import type { ButtonStepProps } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { convertFlowStepText } from "../src/handlers/message/outgoing-message/send-text"

const quickReplies: ButtonStepProps[] = [
  { id: "qr-1", label: "Yes", buttonType: null, beforeStep: null, steps: [] },
]

describe("tiktok quick replies attachment", () => {
  test("turns text plus node quick replies into template cards", () => {
    const [payload] = Array.from(
      convertFlowStepText("business-1", {
        data: {
          contact: { id: "ci-1", sourceConversationId: "conv-1" },
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
        message_type: "TEMPLATE",
        template: expect.objectContaining({
          type: "QA_BUTTON_CARD",
          title: "Choose",
          buttons: [expect.objectContaining({ title: "Yes" })],
        }),
      }),
    )
  })

  test("merges existing text buttons with node quick replies", () => {
    const [payload] = Array.from(
      convertFlowStepText("business-1", {
        data: {
          contact: { id: "ci-1", sourceConversationId: "conv-1" },
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

    expect(payload.template?.buttons).toEqual([
      expect.objectContaining({ title: "Existing" }),
      expect.objectContaining({ title: "Yes" }),
    ])
  })
})
