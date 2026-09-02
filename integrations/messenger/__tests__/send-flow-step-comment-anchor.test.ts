import { MESSENGER_NATIVE_QUICK_REPLY } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  mockEnsureMessengerWhitelistedDomain,
  mockSendPageMessage,
  mockSendPrivateReplyMessage,
} = vi.hoisted(() => ({
  mockEnsureMessengerWhitelistedDomain: vi.fn(),
  mockSendPageMessage: vi.fn(),
  mockSendPrivateReplyMessage: vi.fn(),
}))

vi.mock("../src/apis/message", () => ({
  sendPageMessage: mockSendPageMessage,
}))

vi.mock("../src/apis/comment", () => ({
  sendPrivateReplyMessage: mockSendPrivateReplyMessage,
}))

vi.mock("../src/apis/page", () => ({
  ensureMessengerWhitelistedDomain: mockEnsureMessengerWhitelistedDomain,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendFlowStep, sendMessage } = await import(
  "../src/handlers/message/outgoing-message"
)

const ctx = {
  auth: {
    tokens: { accessToken: "tok" },
    version: "v20.0",
    metadata: { pageId: "page-1" },
  },
  platform: {
    appUrl: "https://app.example.test",
  },
  integrationDetail: { personaId: undefined },
} as never

const contact = {
  id: "contact-1",
  sourceId: "psid-1",
  lastIncomingMessageAt: new Date("2026-06-23T09:00:00.000Z"),
} as never

describe("messenger sendFlowStep — comment-anchored private reply", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendPageMessage.mockResolvedValue({
      recipient_id: "psid-1",
      message_id: "m_normal-1",
    })
    mockSendPrivateReplyMessage.mockResolvedValue({
      recipient_id: "psid-1",
      message_id: "m_anchored-1",
    })
  })

  test("uses the comment_id-anchored Send API when commentAnchor is present", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        commentAnchor: { commentId: "comment-1", replyChannel: "private" },
        step: {
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendText",
          text: "private reply via flow",
          buttons: [],
        },
      },
    } as never)

    expect(mockSendPrivateReplyMessage).toHaveBeenCalledTimes(1)
    expect(mockSendPrivateReplyMessage).toHaveBeenCalledWith(
      ctx.auth,
      "comment-1",
      expect.objectContaining({ text: "private reply via flow" }),
      undefined,
    )
    expect(mockSendPageMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: ["m_anchored-1"] })
  })

  test("uses the normal Send API when commentAnchor.replyChannel is public (defense-in-depth: public replies are never routed here)", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        commentAnchor: { commentId: "comment-1", replyChannel: "public" },
        step: {
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendText",
          text: "public reply via flow",
          buttons: [],
        },
      },
    } as never)

    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    expect(mockSendPrivateReplyMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: ["m_normal-1"] })
  })

  test("uses the normal Send API when commentAnchor is absent (regression guard)", async () => {
    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        step: {
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendText",
          text: "normal flow reply",
          buttons: [],
        },
      },
    } as never)

    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    expect(mockSendPrivateReplyMessage).not.toHaveBeenCalled()
    expect(result).toEqual({ messageIds: ["m_normal-1"] })
  })

  test("only the first Facebook message of a multi-message step uses the comment anchor", async () => {
    const cards = Array.from({ length: 11 }, (_, i) => ({
      title: `Card ${i}`,
      buttons: [],
    }))

    const result = await sendFlowStep({
      ctx,
      data: {
        contact,
        commentAnchor: { commentId: "comment-1", replyChannel: "private" },
        step: {
          id: "step-1",
          nodeId: "node-1",
          stepType: "sendCarousel",
          cards,
        },
      },
    } as never)

    // 11 cards chunked by 10 → 2 Facebook messages for this single step
    expect(mockSendPrivateReplyMessage).toHaveBeenCalledTimes(1)
    expect(mockSendPrivateReplyMessage).toHaveBeenCalledWith(
      ctx.auth,
      "comment-1",
      expect.anything(),
      undefined,
    )
    expect(mockSendPageMessage).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ messageIds: ["m_anchored-1", "m_normal-1"] })
  })
})

describe("messenger sendMessage — canonical button template", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendPageMessage.mockResolvedValue({
      recipient_id: "psid-1",
      message_id: "m_button-1",
    })
  })

  test("renders canonical url and postback buttons as a Facebook button template", async () => {
    await sendMessage({
      ctx,
      data: {
        contact,
        message: {
          id: "message-1",
          workspaceId: "workspace-1",
          conversationId: "conversation-1",
          contentType: "text",
          messageType: "outgoing",
          text: "Appointment Confirmation - Demo Calendar",
          contentAttributes: {
            type: "template",
            payload: {
              templateType: "button",
              buttons: [
                {
                  id: "details",
                  label: "More Information",
                  buttonType: "url",
                  url: "https://app.example.test/booking/schedule?token=schedule",
                },
                {
                  id: "cancel",
                  label: "Cancel",
                  buttonType: "postback",
                  postback: "appointment_cancel:cancel-token",
                },
              ],
            },
          },
        },
      },
    } as never)

    expect(mockSendPageMessage).toHaveBeenCalledWith(
      ctx.auth,
      expect.objectContaining({
        message: expect.objectContaining({
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: "Appointment Confirmation - Demo Calendar",
              buttons: [
                {
                  type: "web_url",
                  title: "More Information",
                  url: "https://app.example.test/booking/schedule?token=schedule",
                },
                {
                  type: "postback",
                  title: "Cancel",
                  payload: "appointment_cancel:cancel-token",
                },
              ],
            },
          },
        }),
      }),
    )
  })

  test("whitelists the app domain and retries once when Messenger Extensions reject the URL", async () => {
    const webviewUrl = "https://app.example.test/booking/picker?token=token"
    mockSendPageMessage
      .mockRejectedValueOnce({
        response: {
          error: {
            code: 100,
            error_subcode: 2_018_062,
            message: "URL is not whitelisted for Messenger Extensions",
          },
        },
      })
      .mockResolvedValueOnce({
        recipient_id: "psid-1",
        message_id: "m_retry-1",
      })

    const result = await sendMessage({
      ctx,
      data: {
        contact,
        message: {
          id: "message-1",
          workspaceId: "workspace-1",
          conversationId: "conversation-1",
          contentType: "text",
          messageType: "outgoing",
          text: "Pick a time",
          contentAttributes: {
            type: "template",
            payload: {
              templateType: "button",
              buttons: [
                {
                  id: "book",
                  label: "Select Date",
                  buttonType: "url",
                  url: webviewUrl,
                  messengerExtensions: true,
                },
              ],
            },
          },
        },
      },
    } as never)

    expect(mockEnsureMessengerWhitelistedDomain).toHaveBeenCalledWith({
      ctx,
      appUrl: webviewUrl,
    })
    expect(
      mockEnsureMessengerWhitelistedDomain.mock.invocationCallOrder[0],
    ).toBeLessThan(mockSendPageMessage.mock.invocationCallOrder[0])
    expect(mockSendPageMessage).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ messageIds: ["m_retry-1"] })
  })

  test("keeps postback-only canonical buttons as native quick replies", async () => {
    const button = {
      id: "option-a",
      label: "Option A",
      buttonType: "postback" as const,
      postback: "option-a",
    }

    await sendMessage({
      ctx,
      data: {
        contact,
        quickReplies: [button],
        message: {
          id: "message-1",
          workspaceId: "workspace-1",
          conversationId: "conversation-1",
          contentType: "text",
          messageType: "outgoing",
          text: "Choose one",
          contentAttributes: {
            type: "template",
            payload: {
              templateType: "button",
              buttons: [button],
            },
          },
        },
      },
    } as never)

    const payload = mockSendPageMessage.mock.calls[0]?.[1]
    expect(payload.message).toEqual(
      expect.objectContaining({
        text: "Choose one",
        quick_replies: [
          {
            content_type: "text",
            title: "Option A",
            payload: "option-a",
          },
        ],
      }),
    )
    expect(payload.message).not.toHaveProperty("attachment")
  })

  test("keeps Messenger contact sentinels as native quick replies", async () => {
    const button = {
      id: MESSENGER_NATIVE_QUICK_REPLY.USER_EMAIL,
      label: "Share email",
      buttonType: "postback" as const,
      postback: MESSENGER_NATIVE_QUICK_REPLY.USER_EMAIL,
    }

    await sendMessage({
      ctx,
      data: {
        contact,
        quickReplies: [button],
        message: {
          id: "message-1",
          workspaceId: "workspace-1",
          conversationId: "conversation-1",
          contentType: "text",
          messageType: "outgoing",
          text: "Share your email",
          contentAttributes: {
            type: "template",
            payload: {
              templateType: "button",
              buttons: [button],
            },
          },
        },
      },
    } as never)

    const payload = mockSendPageMessage.mock.calls[0]?.[1]
    expect(payload.message).toEqual(
      expect.objectContaining({
        text: "Share your email",
        quick_replies: [{ content_type: "user_email" }],
      }),
    )
    expect(payload.message).not.toHaveProperty("attachment")
  })
})
