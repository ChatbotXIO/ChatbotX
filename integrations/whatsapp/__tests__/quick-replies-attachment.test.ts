import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import { convertFlowStepText } from "../src/handlers/message/outgoing-message/send-text"

const quickReplies: MessageButtonTemplate[] = [
  {
    id: "qr-1",
    label: "One",
    buttonType: "postback",
    postback: "flow-1::qr-1",
  },
  {
    id: "qr-2",
    label: "Two",
    buttonType: "url",
    url: "https://example.com?code=flow-1::qr-2",
    postback: "flow-1::qr-2",
  },
  {
    id: "qr-3",
    label: "Three",
    buttonType: "postback",
    postback: "flow-1::qr-3",
  },
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
            reply: expect.objectContaining({
              id: "flow-1::qr-1",
              title: "One",
            }),
          }),
          expect.objectContaining({
            reply: expect.objectContaining({
              id: "flow-1::qr-2",
              title: "Two",
            }),
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
              expect.objectContaining({ id: "flow-1::qr-1", title: "One" }),
              expect.objectContaining({ id: "flow-1::qr-2", title: "Two" }),
              expect.objectContaining({
                id: "flow-1::qr-3",
                title: "Three",
              }),
            ],
          },
        ],
      },
    })
  })

  test("truncates to 10 rows and still sends when merged buttons exceed the WhatsApp interactive list limit", () => {
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
          quickReplies: Array.from({ length: 11 }, (_, index) => ({
            id: `qr-${index}`,
            label: `Option ${index}`,
            buttonType: "postback",
            postback: `flow-1::qr-${index}`,
          })),
        },
      } as never),
    )

    expect(payload).toMatchObject({
      _type: "interactive",
      type: "list",
      action: {
        sections: [
          {
            rows: expect.arrayContaining([
              expect.objectContaining({ title: "Option 0" }),
            ]),
          },
        ],
      },
    })
    const list = payload as unknown as {
      action: { sections: [{ rows: unknown[] }] }
    }
    expect(list.action.sections[0].rows).toHaveLength(10)
  })
})
