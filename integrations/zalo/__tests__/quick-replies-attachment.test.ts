import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { describe, expect, test, vi } from "vitest"
import { convertFlowStepImage } from "../src/handlers/message/outgoing-message/send-image"
import { convertFlowStepText } from "../src/handlers/message/outgoing-message/send-text"

vi.mock("../src/api/message", () => ({
  uploadAttachment: vi.fn(async () => ({
    data: { attachment_id: "attachment-1", width: 320, height: 180 },
  })),
}))

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

async function collectAsync<T>(generator: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of generator) {
    items.push(item)
  }
  return items
}

describe("zalo quick replies attachment", () => {
  test("merges node quick replies into the text template buttons", () => {
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

    expect(payload.attachment?.payload.buttons).toEqual([
      expect.objectContaining({ title: "Existing" }),
      expect.objectContaining({
        title: "Yes",
        payload: "postback_flow-1::qr-1",
      }),
      expect.objectContaining({
        title: "Open",
        payload: { url: "https://example.com?code=flow-1::qr-2" },
      }),
    ])
  })

  test("truncates to 5 buttons and still sends when merged buttons exceed Zalo max", () => {
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
          quickReplies: Array.from({ length: 5 }, (_, index) => ({
            id: `qr-${index}`,
            label: `QR ${index}`,
            buttonType: "postback",
            postback: `flow-1::qr-${index}`,
          })),
        },
      } as never),
    )

    const attachment = (
      payload as unknown as {
        attachment?: { payload: { buttons: unknown[] } }
      }
    ).attachment
    expect(attachment?.payload.buttons).toHaveLength(5)
  })

  test("truncates raw step buttons that alone exceed Zalo max", () => {
    const [payload] = Array.from(
      convertFlowStepText({
        data: {
          contact: { id: "ci-1" },
          flowId: "flow-1",
          step: {
            id: "step-1",
            stepType: "sendText",
            text: "Choose",
            buttons: Array.from({ length: 6 }, (_, index) => ({
              id: `btn-${index}`,
              label: `Button ${index}`,
              buttonType: null,
              beforeStep: null,
              steps: [],
            })),
          },
        },
      } as never),
    )

    const attachment = (
      payload as unknown as {
        attachment?: { payload: { buttons: unknown[] } }
      }
    ).attachment
    expect(attachment?.payload.buttons).toHaveLength(5)
  })

  test("attaches node quick replies to gif media template buttons", async () => {
    const [payload] = await collectAsync(
      convertFlowStepImage({
        ctx: {
          auth: {
            tokens: { accessToken: "token" },
          },
        },
        data: {
          contact: { id: "ci-1" },
          flowId: "flow-1",
          step: {
            id: "step-1",
            stepType: "sendGif",
            url: "https://example.com/anim.gif",
          },
          quickReplies,
        },
      } as never),
    )

    expect(payload.attachment?.payload).toEqual(
      expect.objectContaining({
        template_type: "media",
        elements: [
          expect.objectContaining({
            media_type: "gif",
            attachment_id: "attachment-1",
          }),
        ],
        buttons: [
          expect.objectContaining({
            title: "Yes",
            payload: "postback_flow-1::qr-1",
          }),
          expect.objectContaining({
            title: "Open",
            payload: { url: "https://example.com?code=flow-1::qr-2" },
          }),
        ],
      }),
    )
  })
})
