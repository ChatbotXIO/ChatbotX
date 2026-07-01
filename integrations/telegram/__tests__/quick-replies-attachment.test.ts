import type { ButtonStepProps } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { convertFlowStepImage } from "../src/handlers/message/outgoing-message/send-attachment"
import { convertFlowStepText } from "../src/handlers/message/outgoing-message/send-text"

const quickReplies: ButtonStepProps[] = [
  { id: "qr-1", label: "Yes", buttonType: null, beforeStep: null, steps: [] },
]

describe("telegram quick replies attachment", () => {
  test("merges node quick replies into the inline keyboard", () => {
    const [payload] = Array.from(
      convertFlowStepText({
        data: {
          contact: { sourceId: "chat-1" },
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

    expect(payload.reply_markup?.inline_keyboard.flat()).toEqual([
      expect.objectContaining({ text: "Existing" }),
      expect.objectContaining({ text: "Yes" }),
    ])
  })

  test("adds node quick replies to image payload inline keyboard", () => {
    const [payload] = Array.from(
      convertFlowStepImage({
        data: {
          contact: { sourceId: "chat-1" },
          flowId: "flow-1",
          step: {
            id: "step-1",
            stepType: "sendImage",
            url: "https://example.com/image.png",
            buttons: [],
          },
          quickReplies,
        },
      } as never),
    )

    expect(payload).toEqual(
      expect.objectContaining({
        photo: "https://example.com/image.png",
        reply_markup: {
          inline_keyboard: [[expect.objectContaining({ text: "Yes" })]],
        },
      }),
    )
  })
})
