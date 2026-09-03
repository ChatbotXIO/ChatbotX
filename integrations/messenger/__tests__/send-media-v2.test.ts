import {
  buttonStepDefaultFn,
  type SendImageStepSchema,
  type SendVideoStepSchema,
  sendImageStepDefaultFn,
  sendVideoStepDefaultFn,
} from "@chatbotx.io/flow-config"
import {
  ChannelError,
  type MessageButtonTemplate,
  type SendFlowStepProps,
} from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"
import type { MessengerAuthValue } from "../src/schema"

const {
  mockLogger,
  mockSendPageMessage,
  mockSendPrivateReplyMessage,
  mockUploadAttachment,
} = vi.hoisted(() => ({
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockSendPageMessage: vi.fn(),
  mockSendPrivateReplyMessage: vi.fn(),
  mockUploadAttachment: vi.fn(),
}))

vi.mock("../src/apis/message", () => ({
  sendPageMessage: mockSendPageMessage,
}))

vi.mock("../src/apis/comment", () => ({
  sendPrivateReplyMessage: mockSendPrivateReplyMessage,
}))

vi.mock("../src/apis/attachment", () => ({
  uploadAttachment: mockUploadAttachment,
}))

vi.mock("../src/lib/logger", () => ({
  logger: mockLogger,
}))

const { convertFlowStepMediaV2 } = await import(
  "../src/handlers/message/outgoing-message/send-media-v2"
)
const { sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)
const { MESSENGER_MESSAGE_METADATA } = await import("../src/schema")

type MediaStep = SendImageStepSchema | SendVideoStepSchema
type MediaStepProps = SendFlowStepProps<MessengerAuthValue, MediaStep>
type MediaStepData = MediaStepProps["data"]

const IMAGE_URL = "https://cdn.example.com/space/1/media-library/photo"
const VIDEO_URL = "https://cdn.example.com/space/1/media-library/clip.mp4"

// Partial channel fixtures, same convention as the sibling outgoing tests.
const ctx = {
  auth: {
    tokens: { accessToken: "tok" },
    version: "v20.0",
    metadata: { pageId: "page-1", version: "v20.0" },
  },
  integrationDetail: { personaId: undefined },
} as unknown as MediaStepProps["ctx"]

const contact = {
  id: "contact-1",
  sourceId: "psid-1",
  lastIncomingMessageAt: new Date("2026-06-23T09:00:00.000Z"),
} as unknown as MediaStepData["contact"]

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

const expectedQuickReplies = [
  { content_type: "text", title: "Yes", payload: "flow-1::qr-1" },
  { content_type: "text", title: "Open", payload: "flow-1::qr-2" },
]

const buyButton = buttonStepDefaultFn({ label: "Buy" })

const imageStep = (overrides: Partial<SendImageStepSchema> = {}) => ({
  ...sendImageStepDefaultFn(),
  url: IMAGE_URL,
  ...overrides,
})

const videoStep = (overrides: Partial<SendVideoStepSchema> = {}) => ({
  ...sendVideoStepDefaultFn(),
  url: VIDEO_URL,
  ...overrides,
})

const stepProps = (
  data: Omit<Partial<MediaStepData>, "step"> & { step: MediaStep },
): MediaStepProps =>
  ({
    ctx,
    data: { contact, flowId: "flow-1", ...data },
  }) as MediaStepProps

const convert = (data: Parameters<typeof stepProps>[0]) =>
  collectAsync(convertFlowStepMediaV2(stepProps(data)))

async function collectAsync<T>(generator: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of generator) {
    items.push(item)
  }
  return items
}

const inlineAttachment = (type: "image" | "video", url: string) => ({
  type,
  payload: { url, is_reusable: true },
})

beforeEach(() => {
  vi.clearAllMocks()
  mockSendPageMessage.mockResolvedValue({
    recipient_id: "psid-1",
    message_id: "m_1",
  })
  mockSendPrivateReplyMessage.mockResolvedValue({
    recipient_id: "psid-1",
    message_id: "m_private-1",
  })
  mockUploadAttachment.mockResolvedValue({ attachment_id: "attachment-1" })
})

describe("convertFlowStepMediaV2 — inline delivery (no buttons)", () => {
  test.each([
    ["image", imageStep(), IMAGE_URL],
    ["video", videoStep(), VIDEO_URL],
  ] as const)("sends an %s as a URL attachment without uploading first", async (type, step, url) => {
    const messages = await convert({ step })

    expect(messages).toEqual([{ attachment: inlineAttachment(type, url) }])
    expect(mockUploadAttachment).not.toHaveBeenCalled()
  })

  test.each([
    ["image", imageStep()],
    ["video", videoStep()],
  ] as const)("attaches node quick replies to the inline %s", async (_, step) => {
    const [message] = await convert({ step, quickReplies })

    expect(message).toEqual(
      expect.objectContaining({ quick_replies: expectedQuickReplies }),
    )
  })

  test("omits the quick_replies key when the node has none", async () => {
    const [message] = await convert({ step: imageStep() })

    expect(message).not.toHaveProperty("quick_replies")
  })

  test("forwards the step url verbatim", async () => {
    const url = "https://cdn.example.com/already-interpolated/abc?x=1&y=2"

    const [message] = await convert({ step: imageStep({ url }) })

    expect(message?.attachment?.payload.url).toBe(url)
  })
})

describe("convertFlowStepMediaV2 — media template fallback (buttons)", () => {
  test("uploads and sends an image media template when the step has buttons", async () => {
    const messages = await convert({
      step: imageStep({ buttons: [buyButton] }),
    })

    expect(mockUploadAttachment).toHaveBeenCalledTimes(1)
    expect(mockUploadAttachment).toHaveBeenCalledWith(
      ctx.auth,
      IMAGE_URL,
      "image",
    )
    expect(messages).toEqual([
      {
        attachment: {
          type: "template",
          payload: {
            template_type: "media",
            elements: [
              {
                media_type: "image",
                attachment_id: "attachment-1",
                buttons: [
                  expect.objectContaining({ type: "postback", title: "Buy" }),
                ],
              },
            ],
          },
        },
      },
    ])
  })

  test("uploads and sends a video media template when the step has buttons", async () => {
    const messages = await convert({
      step: videoStep({ buttons: [buyButton] }),
    })

    expect(mockUploadAttachment).toHaveBeenCalledWith(
      ctx.auth,
      VIDEO_URL,
      "video",
    )
    expect(messages[0]?.attachment?.payload.elements?.[0]).toEqual(
      expect.objectContaining({
        media_type: "video",
        attachment_id: "attachment-1",
      }),
    )
  })

  test("attaches node quick replies to the media template", async () => {
    const [message] = await convert({
      step: imageStep({ buttons: [buyButton] }),
      quickReplies,
    })

    expect(message).toEqual(
      expect.objectContaining({
        attachment: expect.objectContaining({ type: "template" }),
        quick_replies: expectedQuickReplies,
      }),
    )
  })

  test("keeps the legacy contract: an upload failure yields nothing and does not throw", async () => {
    mockUploadAttachment.mockRejectedValueOnce(new Error("upload failed"))

    const messages = await convert({
      step: imageStep({ buttons: [buyButton] }),
    })

    expect(messages).toEqual([])
    expect(mockLogger.error).toHaveBeenCalledTimes(1)
  })
})

describe("messenger sendFlowStep — sendImage / sendVideo routed through v2", () => {
  test("sends an inline image in exactly one Send API call", async () => {
    const result = await sendFlowStep(stepProps({ step: imageStep() }))

    expect(mockUploadAttachment).not.toHaveBeenCalled()
    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendPageMessage.mock.calls[0]
    expect(payload).toEqual({
      recipient: { id: "psid-1" },
      message: {
        attachment: inlineAttachment("image", IMAGE_URL),
        metadata: MESSENGER_MESSAGE_METADATA,
      },
      messaging_type: "RESPONSE",
      tag: undefined,
      persona_id: undefined,
    })
    expect(result).toEqual({ messageIds: ["m_1"] })
  })

  test("sends an inline video in exactly one Send API call", async () => {
    await sendFlowStep(stepProps({ step: videoStep() }))

    expect(mockUploadAttachment).not.toHaveBeenCalled()
    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendPageMessage.mock.calls[0]
    expect(payload.message.attachment).toEqual(
      inlineAttachment("video", VIDEO_URL),
    )
  })

  test("falls back to upload + media template when the step has buttons", async () => {
    await sendFlowStep(stepProps({ step: imageStep({ buttons: [buyButton] }) }))

    expect(mockUploadAttachment).toHaveBeenCalledTimes(1)
    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendPageMessage.mock.calls[0]
    expect(payload.message.attachment.payload.template_type).toBe("media")
    expect(payload.message.attachment.payload.elements[0].attachment_id).toBe(
      "attachment-1",
    )
  })

  test("surfaces a Graph fetch failure as a mapped ChannelError instead of swallowing it", async () => {
    mockSendPageMessage.mockRejectedValueOnce({
      response: {
        error: {
          code: 100,
          error_subcode: 2_018_008,
          message: "Failed to fetch the file from the url",
        },
      },
    })

    const promise = sendFlowStep(stepProps({ step: imageStep() }))

    await expect(promise).rejects.toBeInstanceOf(ChannelError)
    await expect(promise).rejects.toMatchObject({
      code: 100,
      subCode: 2_018_008,
    })
    expect(mockUploadAttachment).not.toHaveBeenCalled()
  })

  test("keeps the legacy contract end-to-end: upload failure on the buttons path resolves with no message ids", async () => {
    mockUploadAttachment.mockRejectedValueOnce(new Error("upload failed"))

    const result = await sendFlowStep(
      stepProps({ step: imageStep({ buttons: [buyButton] }) }),
    )

    expect(result).toEqual({ messageIds: [] })
    expect(mockSendPageMessage).not.toHaveBeenCalled()
  })
})

describe("messenger sendFlowStep — private comment anchor with v2 media", () => {
  const privateAnchor = {
    replyChannel: "private",
    commentId: "comment-1",
  } as const

  test.each([
    ["image", imageStep(), IMAGE_URL],
    ["video", videoStep(), VIDEO_URL],
  ] as const)("routes an inline %s through the private-reply API", async (type, step, url) => {
    await sendFlowStep(stepProps({ step, commentAnchor: privateAnchor }))

    expect(mockUploadAttachment).not.toHaveBeenCalled()
    expect(mockSendPageMessage).not.toHaveBeenCalled()
    expect(mockSendPrivateReplyMessage).toHaveBeenCalledTimes(1)
    expect(mockSendPrivateReplyMessage).toHaveBeenCalledWith(
      ctx.auth,
      "comment-1",
      { attachment: inlineAttachment(type, url) },
      undefined,
    )
  })

  test("keeps node quick replies on the private-reply inline image", async () => {
    await sendFlowStep(
      stepProps({
        step: imageStep(),
        quickReplies,
        commentAnchor: privateAnchor,
      }),
    )

    const [, , message] = mockSendPrivateReplyMessage.mock.calls[0]
    expect(message).toEqual({
      attachment: inlineAttachment("image", IMAGE_URL),
      quick_replies: expectedQuickReplies,
    })
  })

  test("sends the unchanged media template through the private-reply API when the step has buttons", async () => {
    await sendFlowStep(
      stepProps({
        step: imageStep({ buttons: [buyButton] }),
        commentAnchor: privateAnchor,
      }),
    )

    expect(mockUploadAttachment).toHaveBeenCalledTimes(1)
    expect(mockSendPageMessage).not.toHaveBeenCalled()
    const [, commentId, message] = mockSendPrivateReplyMessage.mock.calls[0]
    expect(commentId).toBe("comment-1")
    expect(message.attachment.payload.template_type).toBe("media")
    expect(message.attachment.payload.elements[0].attachment_id).toBe(
      "attachment-1",
    )
  })
})
