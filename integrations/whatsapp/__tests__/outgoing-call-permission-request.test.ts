import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockApiFetch, mockSendMessage, mockGetWhatsappClient } = vi.hoisted(
  () => {
    const apiFetch = vi.fn()
    const sendMessageFn = vi.fn()
    return {
      mockApiFetch: apiFetch,
      mockSendMessage: sendMessageFn,
      mockGetWhatsappClient: vi.fn(() => ({
        $$apiFetch$$: apiFetch,
        sendMessage: sendMessageFn,
      })),
    }
  },
)

vi.mock("../src/client", () => ({
  getWhatsappClient: mockGetWhatsappClient,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendMessage } = await import("../src/handlers/message/outgoing-message")

const ctx = {
  auth: { metadata: { phoneNumber: { id: "pn-1" } } },
} as never

const contact = {
  id: "contact-1",
  sourceId: "84123456789",
} as never

const rawRequestBody = () =>
  JSON.parse(
    (mockApiFetch.mock.calls[0][1] as RequestInit).body as string,
  ) as Record<string, unknown>

describe("WhatsApp sendMessage — call permission request", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendMessage.mockResolvedValue({
      messaging_product: "whatsapp",
      messages: [{ id: "wamid.lib-1" }],
    })
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.raw-1" }] }), {
        status: 200,
      }),
    )
  })

  test("permission-request messages post the raw interactive, not plain text", async () => {
    const result = await sendMessage({
      ctx,
      data: {
        contact,
        message: {
          id: "msg-1",
          workspaceId: "ws-1",
          conversationId: "conv-1",
          contentType: "text",
          messageType: "outgoing",
          text: "May we call you?",
          contentAttributes: { type: "whatsapp_call_permission_request" },
        },
      },
    } as never)

    // Raw payloads bypass the whatsapp-api-js sender for every recipient.
    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(mockApiFetch).toHaveBeenCalledTimes(1)
    expect(rawRequestBody()).toMatchObject({
      messaging_product: "whatsapp",
      to: "84123456789",
      type: "interactive",
      interactive: {
        type: "call_permission_request",
        body: { text: "May we call you?" },
        action: { name: "call_permission_request" },
      },
    })
    expect(result.messageIds).toEqual(["wamid.raw-1"])
  })

  test("ordinary text messages keep using the lib path (regression)", async () => {
    await sendMessage({
      ctx,
      data: {
        contact,
        message: {
          id: "msg-2",
          workspaceId: "ws-1",
          conversationId: "conv-1",
          contentType: "text",
          messageType: "outgoing",
          text: "hello",
          contentAttributes: null,
        },
      },
    } as never)

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(mockApiFetch).not.toHaveBeenCalled()
  })
})
