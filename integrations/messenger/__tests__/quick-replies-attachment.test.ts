import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { convertFlowStepFile } from "../src/handlers/message/outgoing-message/send-file"
import { convertFlowStepGif } from "../src/handlers/message/outgoing-message/send-gif"
import { convertFlowStepMedia } from "../src/handlers/message/outgoing-message/send-media"
import { convertFlowStepText } from "../src/handlers/message/outgoing-message/send-text"

vi.mock("../src/apis/attachment", () => ({
  uploadAttachment: vi.fn(async () => ({ attachment_id: "attachment-1" })),
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

describe("messenger quick replies attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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
          expect.objectContaining({
            title: "Yes",
            content_type: "text",
            payload: "flow-1::qr-1",
          }),
          expect.objectContaining({
            title: "Open",
            content_type: "text",
            payload: "flow-1::qr-2",
          }),
        ],
      }),
    )
  })

  test("attaches node quick replies when text renders a button template", () => {
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
        quick_replies: [
          expect.objectContaining({
            title: "Yes",
            payload: "flow-1::qr-1",
          }),
          expect.objectContaining({
            title: "Open",
            payload: "flow-1::qr-2",
          }),
        ],
      }),
    )
  })

  test("omits quick replies when text renders a button template without node quick replies", () => {
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
        },
      } as never),
    )

    expect(payload).toHaveProperty("attachment")
    expect(payload).not.toHaveProperty("quick_replies")
  })

  test.each([
    ["sendImage", convertFlowStepMedia],
    ["sendVideo", convertFlowStepMedia],
    ["sendAudio", convertFlowStepFile],
    ["sendFile", convertFlowStepFile],
  ] as const)("attaches node quick replies to %s attachment payloads", async (stepType, converter) => {
    const [payload] = await collectAsync(
      converter({
        ctx: {
          auth: {
            tokens: { accessToken: "token" },
            metadata: { version: "v1" },
          },
        },
        data: {
          contact: { id: "ci-1" },
          flowId: "flow-1",
          step: {
            id: "step-1",
            stepType,
            mode: "file",
            url: "https://example.com/file",
            buttons: [],
          },
          quickReplies,
        },
      } as never),
    )

    expect(payload).toEqual(
      expect.objectContaining({
        quick_replies: [
          expect.objectContaining({
            title: "Yes",
            payload: "flow-1::qr-1",
          }),
          expect.objectContaining({
            title: "Open",
            payload: "flow-1::qr-2",
          }),
        ],
      }),
    )
  })

  test.each([
    ["sendImage", convertFlowStepMedia],
    ["sendVideo", convertFlowStepMedia],
    ["sendAudio", convertFlowStepFile],
    ["sendFile", convertFlowStepFile],
  ] as const)("omits quick replies from %s attachment payloads when none are provided", async (stepType, converter) => {
    const [payload] = await collectAsync(
      converter({
        ctx: {
          auth: {
            tokens: { accessToken: "token" },
            metadata: { version: "v1" },
          },
        },
        data: {
          contact: { id: "ci-1" },
          flowId: "flow-1",
          step: {
            id: "step-1",
            stepType,
            mode: "file",
            url: "https://example.com/file",
            buttons: [],
          },
        },
      } as never),
    )

    expect(payload).not.toHaveProperty("quick_replies")
  })

  test("attaches node quick replies to gif payloads", () => {
    const [payload] = Array.from(
      convertFlowStepGif("https://example.com/anim.gif", quickReplies),
    )

    expect(payload).toEqual(
      expect.objectContaining({
        quick_replies: [
          expect.objectContaining({
            title: "Yes",
            payload: "flow-1::qr-1",
          }),
          expect.objectContaining({
            title: "Open",
            payload: "flow-1::qr-2",
          }),
        ],
      }),
    )
  })

  test("omits quick replies from gif payloads when none are provided", () => {
    const [payload] = Array.from(
      convertFlowStepGif("https://example.com/anim.gif"),
    )

    expect(payload).not.toHaveProperty("quick_replies")
  })
})
