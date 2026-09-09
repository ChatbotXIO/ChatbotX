import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockSendInstagramMessage,
  mockSendPrivateReplyMessage,
  mockUploadAttachment,
} = vi.hoisted(() => ({
  mockSendInstagramMessage: vi.fn(),
  mockSendPrivateReplyMessage: vi.fn(),
  mockUploadAttachment: vi.fn(),
}))

vi.mock("../src/apis/page", () => ({
  sendInstagramMessage: mockSendInstagramMessage,
}))

vi.mock("../src/apis/comment", () => ({
  sendPrivateReplyMessage: mockSendPrivateReplyMessage,
}))

vi.mock("../src/apis/attachment", () => ({
  uploadAttachment: mockUploadAttachment,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendFlowStep } = await import(
  "../src/handlers/message/outgoing-message"
)
const { logger } = await import("../src/lib/logger")

const ctx = {
  auth: {
    tokens: { accessToken: "tok" },
    metadata: { igId: "ig-1", version: "v23.0" },
  },
} as never

// Inside the 24-hour window, so `resolveInstagramMessagingPolicy` lets a
// normal (non-anchored) automated send through.
const contact = {
  id: "contact-1",
  sourceId: "igsid-1",
  lastIncomingMessageAt: new Date(Date.now() - 60 * 60 * 1000),
} as never

const IMAGE_URL = "https://example.com/a.png"
const VIDEO_URL = "https://example.com/a.mp4"

const buttons = [
  {
    id: "btn-1",
    label: "Visit",
    buttonType: "openWebsite",
    beforeStep: { url: "https://example.com" },
    steps: [],
  },
  {
    id: "btn-2",
    label: "Chat",
    buttonType: "sendMessage",
    beforeStep: {},
    steps: [],
  },
]

const quickReplies = [
  { id: "qr-1", label: "Yes", buttonType: "postback", postback: "qr-payload" },
]

const buildData = (step: unknown, extra: Record<string, unknown> = {}) => ({
  contact,
  flowId: "flow-1",
  flowVersionId: "flow-version-1",
  step,
  ...extra,
})

describe("instagram sendFlowStep — image/video steps", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendInstagramMessage.mockResolvedValue({
      recipient_id: "igsid-1",
      message_id: "m_normal-1",
    })
    mockSendPrivateReplyMessage.mockResolvedValue({
      recipient_id: "igsid-1",
      message_id: "m_anchored-1",
    })
    mockUploadAttachment.mockResolvedValue({
      recipient_id: "igsid-1",
      attachment_id: "att-1",
    })
  })

  test("sends a button-less image as a bare attachment, never a media template (Instagram has no media template — 100/2534015)", async () => {
    const result = await sendFlowStep({
      ctx,
      data: buildData({
        id: "step-1",
        nodeId: "node-1",
        stepType: "sendImage",
        mode: "file",
        url: IMAGE_URL,
        buttons: [],
      }),
    } as never)

    expect(mockSendInstagramMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendInstagramMessage.mock.calls[0]
    expect(payload.message.attachment).toEqual({
      type: "image",
      payload: { url: IMAGE_URL, is_reusable: true },
    })
    expect(JSON.stringify(payload)).not.toContain("template")
    expect(result).toEqual({ messageIds: ["m_normal-1"] })
  })

  // Instagram cannot attach buttons to a media message: pairing them needs a
  // template, and a template replaces the media with its own rendering. The
  // media is what the step is for, so the buttons are dropped (logged) rather
  // than the media being downgraded into a card.
  test.each([
    ["sendImage", IMAGE_URL, "image"],
    ["sendVideo", VIDEO_URL, "video"],
  ])("drops the buttons of a %s step and still sends the media as a plain attachment", async (stepType, url, attachmentType) => {
    const result = await sendFlowStep({
      ctx,
      data: buildData({
        id: "step-1",
        nodeId: "node-1",
        stepType,
        mode: "file",
        url,
        buttons,
      }),
    } as never)

    expect(mockSendInstagramMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendInstagramMessage.mock.calls[0]
    expect(payload.message.attachment).toEqual({
      type: attachmentType,
      payload: { url, is_reusable: true },
    })
    expect(JSON.stringify(payload)).not.toContain("template")
    expect(JSON.stringify(payload)).not.toContain("Visit")
    // Dropped silently, a postback branch waiting on one of these stalls
    // with no trace — so the drop has to reach the logs.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "step-1", buttonCount: 2 }),
      expect.stringContaining("buttons"),
    )
    expect(result).toEqual({ messageIds: ["m_normal-1"] })
  })

  test("keeps quick replies on a media step", async () => {
    await sendFlowStep({
      ctx,
      data: buildData(
        {
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendImage",
          mode: "file",
          url: IMAGE_URL,
          buttons: [],
        },
        { quickReplies },
      ),
    } as never)

    const [, payload] = mockSendInstagramMessage.mock.calls[0]
    expect(payload.message.quick_replies).toHaveLength(1)
  })

  test("routes the first message of an image step through the comment-anchored Send API", async () => {
    const result = await sendFlowStep({
      ctx,
      data: buildData(
        {
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendImage",
          mode: "file",
          url: IMAGE_URL,
          buttons: [],
        },
        { commentAnchor: { commentId: "comment-1", replyChannel: "private" } },
      ),
    } as never)

    expect(mockSendPrivateReplyMessage).toHaveBeenCalledTimes(1)
    expect(mockSendPrivateReplyMessage).toHaveBeenCalledWith(
      ctx.auth,
      "comment-1",
      expect.objectContaining({
        attachment: {
          type: "image",
          payload: { url: IMAGE_URL, is_reusable: true },
        },
      }),
    )
    expect(mockSendInstagramMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: ["m_anchored-1"] })
  })

  test("sends a file step by attachment_id from the upload API", async () => {
    const result = await sendFlowStep({
      ctx,
      data: buildData({
        id: "step-1",
        nodeId: "node-1",
        stepType: "sendFile",
        mode: "file",
        url: "https://example.com/a.pdf",
        buttons: [],
      }),
    } as never)

    expect(mockUploadAttachment).toHaveBeenCalledWith(
      ctx.auth,
      "https://example.com/a.pdf",
      "file",
    )
    const [, payload] = mockSendInstagramMessage.mock.calls[0]
    expect(payload.message.attachment).toEqual({
      type: "file",
      payload: { attachment_id: "att-1" },
    })
    expect(result).toEqual({ messageIds: ["m_normal-1"] })
  })

  // Used to be swallowed by a try/catch that yielded nothing: the step became
  // a silent no-op while the inbox still showed the message.
  test("surfaces an upload failure on a file step instead of skipping the step", async () => {
    mockUploadAttachment.mockRejectedValue(new Error("upload failed"))

    await expect(
      sendFlowStep({
        ctx,
        data: buildData({
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendFile",
          mode: "file",
          url: "https://example.com/a.pdf",
          buttons: [],
        }),
      } as never),
    ).rejects.toThrow()

    expect(mockSendInstagramMessage).not.toHaveBeenCalled()
  })
})
