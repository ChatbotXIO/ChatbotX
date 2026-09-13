import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockApiFetch, mockGetWhatsappClient } = vi.hoisted(() => {
  const apiFetchFn = vi.fn()
  return {
    mockApiFetch: apiFetchFn,
    mockGetWhatsappClient: vi.fn(() => ({ $$apiFetch$$: apiFetchFn })),
  }
})

vi.mock("../src/client", () => ({
  getWhatsappClient: mockGetWhatsappClient,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { conversationHandlers } = await import("../src/handlers/conversation")

const ctx = {
  auth: { metadata: { phoneNumber: { id: "pn-123" } } },
} as never

const contact = { id: "contact-1", sourceId: "84123456789" } as never

describe("whatsapp conversation handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true }),
    })
  })

  describe("sendTyping", () => {
    test("does nothing when typing is false", async () => {
      await conversationHandlers.sendTyping({
        ctx,
        data: { contact, typing: false, messageId: "wamid.123" },
      } as never)

      expect(mockApiFetch).not.toHaveBeenCalled()
    })

    test("skips API call when messageId is missing", async () => {
      await conversationHandlers.sendTyping({
        ctx,
        data: { contact, typing: true },
      } as never)

      expect(mockApiFetch).not.toHaveBeenCalled()
    })

    test("sends official Meta typing indicator payload with incoming messageId", async () => {
      await conversationHandlers.sendTyping({
        ctx,
        data: {
          contact,
          typing: true,
          seconds: 3,
          messageId: "wamid.HBgLMTIzNDU2Nzg5FQIAEhgg",
        },
      } as never)

      expect(mockApiFetch).toHaveBeenCalledTimes(1)
      const [url, init] = mockApiFetch.mock.calls[0]
      expect(url).toContain("/pn-123/messages")
      expect(init.method).toBe("POST")
      expect(init.headers).toEqual({ "Content-Type": "application/json" })
      expect(JSON.parse(init.body)).toEqual({
        messaging_product: "whatsapp",
        status: "read",
        message_id: "wamid.HBgLMTIzNDU2Nzg5FQIAEhgg",
        typing_indicator: {
          type: "text",
        },
      })
    })

    test("handles non-ok API responses gracefully without throwing", async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({
          error: { message: "Invalid message_id", code: 100 },
        }),
      })

      await expect(
        conversationHandlers.sendTyping({
          ctx,
          data: {
            contact,
            typing: true,
            messageId: "wamid.invalid",
          },
        } as never),
      ).resolves.not.toThrow()
    })

    test("handles network errors gracefully without throwing", async () => {
      mockApiFetch.mockRejectedValue(new Error("Network timeout"))

      await expect(
        conversationHandlers.sendTyping({
          ctx,
          data: {
            contact,
            typing: true,
            messageId: "wamid.timeout",
          },
        } as never),
      ).resolves.not.toThrow()
    })
  })

  describe("agentMarkAsRead", () => {
    test("runs safely without throwing", async () => {
      await expect(
        conversationHandlers.agentMarkAsRead({
          ctx,
          data: { contact },
        } as never),
      ).resolves.not.toThrow()
    })
  })
})
