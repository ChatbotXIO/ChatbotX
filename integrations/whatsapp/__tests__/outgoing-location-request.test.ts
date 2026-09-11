import { WHATSAPP_NATIVE_LOCATION_REQUEST } from "@chatbotx.io/sdk"
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

const PHONE_NUMBER_ID = "pn-1"
const ctx = {
  auth: { metadata: { phoneNumber: { id: PHONE_NUMBER_ID } } },
} as never

const phoneKeyedContact = {
  id: "contact-1",
  sourceId: "84123456789",
} as never

const locationRequestQuickReply = [
  {
    id: WHATSAPP_NATIVE_LOCATION_REQUEST,
    label: "Send location",
    buttonType: "postback" as const,
    postback: WHATSAPP_NATIVE_LOCATION_REQUEST,
  },
]

const rawRequestBody = () =>
  JSON.parse((mockApiFetch.mock.calls[0][1] as RequestInit).body as string) as {
    to?: string
    type?: string
    interactive?: {
      type?: string
      body?: { text?: string }
      action?: { name?: string }
    }
  }

describe("WhatsApp sendMessage — native location request", () => {
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

  test("posts Cloud API location_request_message even for a phone-keyed contact", async () => {
    await sendMessage({
      ctx,
      data: {
        contact: phoneKeyedContact,
        message: {
          id: "msg-1",
          contentType: "text",
          text: "Please share your location",
        },
        quickReplies: locationRequestQuickReply,
      },
    } as never)

    expect(mockSendMessage).not.toHaveBeenCalled()
    expect(mockApiFetch).toHaveBeenCalledTimes(1)
    const body = rawRequestBody()
    expect(body.to).toBe("84123456789")
    expect(body.type).toBe("interactive")
    expect(body.interactive).toEqual({
      type: "location_request_message",
      body: { text: "Please share your location" },
      action: { name: "send_location" },
    })
  })

  test("does not emit location_request_message for a plain text send", async () => {
    await sendMessage({
      ctx,
      data: {
        contact: phoneKeyedContact,
        message: { id: "msg-2", contentType: "text", text: "hello" },
      },
    } as never)

    expect(mockApiFetch).not.toHaveBeenCalled()
    expect(mockSendMessage).toHaveBeenCalledTimes(1)
  })
})
