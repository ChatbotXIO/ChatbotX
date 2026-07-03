import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { describe, expect, test } from "vitest"
import {
  convertFlowStepFile,
  convertFlowStepImage,
} from "../src/handlers/message/outgoing-message/send-attachment"
import { convertFlowStepText } from "../src/handlers/message/outgoing-message/send-text"

const quickReplies: MessageButtonTemplate[] = [
  {
    id: "qr-1",
    label: "Yes",
    buttonType: "postback",
    postback: "flow-1::qr-1",
  },
  {
    id: "qr-2",
    label: "Open",
    buttonType: "url",
    url: "https://example.com?code=flow-1::qr-2",
    postback: "flow-1::qr-2",
  },
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
      expect.objectContaining({
        text: "Yes",
        callback_data: "flow-1::qr-1",
      }),
      expect.objectContaining({
        text: "Open",
        url: "https://example.com?code=flow-1::qr-2",
      }),
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
          inline_keyboard: [
            [
              expect.objectContaining({
                text: "Yes",
                callback_data: "flow-1::qr-1",
              }),
              expect.objectContaining({
                text: "Open",
                url: "https://example.com?code=flow-1::qr-2",
              }),
            ],
          ],
        },
      }),
    )
  })

  test("adds node quick replies to non-image attachment inline keyboard", () => {
    const [payload] = Array.from(
      convertFlowStepFile({
        data: {
          contact: { sourceId: "chat-1" },
          flowId: "flow-1",
          step: {
            id: "step-1",
            stepType: "sendFile",
            url: "https://example.com/file.pdf",
            buttons: [],
          },
          quickReplies,
        },
      } as never),
    )

    expect(payload).toEqual(
      expect.objectContaining({
        document: "https://example.com/file.pdf",
        reply_markup: {
          inline_keyboard: [
            [
              expect.objectContaining({
                text: "Yes",
                callback_data: "flow-1::qr-1",
              }),
              expect.objectContaining({
                text: "Open",
                url: "https://example.com?code=flow-1::qr-2",
              }),
            ],
          ],
        },
      }),
    )
  })
})
