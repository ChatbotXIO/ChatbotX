import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockSendMessage, mockGetWhatsappClient } = vi.hoisted(() => {
  const sendMessageFn = vi.fn()
  return {
    mockSendMessage: sendMessageFn,
    mockGetWhatsappClient: vi.fn(() => ({ sendMessage: sendMessageFn })),
  }
})

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
const contact = { id: "contact-1", sourceId: "84123456789" } as never

describe("whatsapp sendMessage returns provider message ids", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSendMessage.mockResolvedValue({
      messaging_product: "whatsapp",
      messages: [{ id: "wamid.provider-1" }],
    })
  })

  test("returns the provider message id so the worker can persist sourceId", async () => {
    const result = await sendMessage({
      ctx,
      data: {
        contact,
        message: { id: "msg-1", contentType: "text", text: "hello" },
      },
    } as never)

    expect(mockSendMessage).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ messageIds: ["wamid.provider-1"] })
  })
})
