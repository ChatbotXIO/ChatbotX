import type { ButtonStepProps } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { convertFlowStepText } from "../src/handlers/message/outgoing-message/send-text"

const quickReplies: ButtonStepProps[] = [
  { id: "qr-1", label: "One", buttonType: null, beforeStep: null, steps: [] },
  { id: "qr-2", label: "Two", buttonType: null, beforeStep: null, steps: [] },
  { id: "qr-3", label: "Three", buttonType: null, beforeStep: null, steps: [] },
]

describe("whatsapp quick replies attachment", () => {
  test("uses reply buttons when merged buttons are at most three", () => {
    const [payload] = Array.from(
      convertFlowStepText({
        data: {
          flowId: "flow-1",
          step: {
            id: "step-1",
            stepType: "sendText",
            text: "Choose",
            buttons: [],
          },
          quickReplies: quickReplies.slice(0, 2),
        },
      } as never),
    )

    expect(payload).toMatchObject({
      _type: "interactive",
      type: "button",
      action: {
        buttons: [
          expect.objectContaining({
            reply: expect.objectContaining({ title: "One" }),
          }),
          expect.objectContaining({
            reply: expect.objectContaining({ title: "Two" }),
          }),
        ],
      },
    })
  })

  test("uses an interactive list when merged buttons exceed three", () => {
    const [payload] = Array.from(
      convertFlowStepText({
        data: {
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

    expect(payload).toMatchObject({
      _type: "interactive",
      type: "list",
      action: {
        button: "Options",
        sections: [
          {
            rows: [
              expect.objectContaining({ title: "Existing" }),
              expect.objectContaining({ title: "One" }),
              expect.objectContaining({ title: "Two" }),
              expect.objectContaining({ title: "Three" }),
            ],
          },
        ],
      },
    })
  })
})
