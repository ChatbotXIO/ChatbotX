import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { sendMessage } from "../src/handlers/message/outgoing-message"

const { mockSendPageMessage } = vi.hoisted(() => ({
  mockSendPageMessage: vi.fn(),
}))

vi.mock("../src/apis/message", () => ({
  sendPageMessage: mockSendPageMessage,
}))

const postbackQuickReply: MessageButtonTemplate = {
  id: "qr-1",
  label: "Yes",
  buttonType: "postback",
  postback: "flow-1::qr-1",
}

const urlQuickReply: MessageButtonTemplate = {
  id: "qr-2",
  label: "Open",
  buttonType: "url",
  url: "https://example.com/open",
}

// Mirrors a real appointment-scheduling booking button: url-type, no postback fallback.
const bookingButton: MessageButtonTemplate = {
  id: "booking-1",
  label: "Book now",
  buttonType: "url",
  url: "https://example.com/booking/slug",
}

function buttonTemplateContentAttributes(buttons: MessageButtonTemplate[]) {
  return {
    type: "template" as const,
    payload: { templateType: "button" as const, buttons },
  }
}

function makeProps(overrides: {
  contentAttributes?: unknown
  quickReplies?: MessageButtonTemplate[]
}) {
  return {
    ctx: {
      auth: {
        tokens: { accessToken: "token" },
        metadata: { pageId: "page-1" },
        version: "v1",
      },
      integrationDetail: undefined,
    },
    data: {
      contact: { id: "contact-1", sourceId: "psid-1" },
      message: {
        id: "msg-1",
        workspaceId: "ws-1",
        conversationId: "conv-1",
        contentType: "text",
        text: "Choose an option",
        contentAttributes: overrides.contentAttributes ?? null,
        messageType: "outgoing",
      },
      quickReplies: overrides.quickReplies,
      sendFrom: undefined,
    },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSendPageMessage.mockResolvedValue({ message_id: "mid-1" })
})

describe("sendMessage quick_replies vs button-template", () => {
  test("keeps postback quick replies even when a url button-template attachment is present", async () => {
    await sendMessage(
      makeProps({
        contentAttributes: buttonTemplateContentAttributes([bookingButton]),
        quickReplies: [postbackQuickReply],
      }),
    )

    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    const [, payload] = mockSendPageMessage.mock.calls[0]
    expect(payload.message.attachment).toMatchObject({
      type: "template",
      payload: { template_type: "button" },
    })
    expect(payload.message.quick_replies).toEqual([
      expect.objectContaining({ title: "Yes", payload: "flow-1::qr-1" }),
    ])
  })

  test("excludes url-type entries from native quick replies", async () => {
    await sendMessage(
      makeProps({
        quickReplies: [postbackQuickReply, urlQuickReply],
      }),
    )

    const [, payload] = mockSendPageMessage.mock.calls[0]
    expect(payload.message.quick_replies).toEqual([
      expect.objectContaining({ title: "Yes", payload: "flow-1::qr-1" }),
    ])
  })

  test("omits quick_replies field entirely when all quickReplies are url-type", async () => {
    await sendMessage(
      makeProps({
        quickReplies: [urlQuickReply],
      }),
    )

    const [, payload] = mockSendPageMessage.mock.calls[0]
    expect(payload.message).not.toHaveProperty("quick_replies")
  })

  test("appointment booking button (url, no postback) + unrelated postback quick reply both render correctly", async () => {
    await sendMessage(
      makeProps({
        contentAttributes: buttonTemplateContentAttributes([bookingButton]),
        quickReplies: [bookingButton, postbackQuickReply],
      }),
    )

    const [, payload] = mockSendPageMessage.mock.calls[0]
    expect(payload.message.attachment.payload.buttons).toEqual([
      expect.objectContaining({ type: "web_url", url: bookingButton.url }),
    ])
    expect(payload.message.quick_replies).toEqual([
      expect.objectContaining({ title: "Yes", payload: "flow-1::qr-1" }),
    ])
  })
})
