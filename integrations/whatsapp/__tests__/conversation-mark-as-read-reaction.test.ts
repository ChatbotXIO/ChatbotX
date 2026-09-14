import { beforeEach, describe, expect, test, vi } from "vitest"

const mockApiFetch = vi.fn()

vi.mock("../src/client", () => ({
  getWhatsappClient: vi.fn(() => ({
    $$apiFetch$$: mockApiFetch,
  })),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { conversationHandlers } = await import("../src/handlers/conversation")

const ctx = {
  auth: { metadata: { phoneNumber: { id: "pn-123" } } },
}

const contact = {
  id: "contact-1",
  sourceId: "84123456789",
}

describe("whatsapp conversation handlers: markAsRead and reaction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ success: true }),
    })
  })

  describe("agentMarkAsRead", () => {
    test("skips API call when messageId is missing", async () => {
      await conversationHandlers.agentMarkAsRead({
        ctx,
        data: { contact },
      } as never)

      expect(mockApiFetch).not.toHaveBeenCalled()
    })

    test("sends official Meta mark as read payload with incoming messageId", async () => {
      await conversationHandlers.agentMarkAsRead({
        ctx,
        data: {
          contact,
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
      })
    })

    test("handles API errors gracefully without throwing", async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ error: { message: "Error" } }),
      })

      await expect(
        conversationHandlers.agentMarkAsRead({
          ctx,
          data: { contact, messageId: "wamid.invalid" },
        } as never),
      ).resolves.not.toThrow()
    })
  })

  describe("sendReaction", () => {
    test("skips API call when messageId is missing", async () => {
      await conversationHandlers.sendReaction?.({
        ctx,
        data: { contact, emoji: "👍" },
      } as never)

      expect(mockApiFetch).not.toHaveBeenCalled()
    })

    test("skips API call when recipient sourceId is missing", async () => {
      await conversationHandlers.sendReaction?.({
        ctx,
        data: {
          contact: { id: "c-1" } as never,
          emoji: "👍",
          messageId: "wamid.123",
        },
      } as never)

      expect(mockApiFetch).not.toHaveBeenCalled()
    })

    test("sends official Meta reaction payload with incoming messageId and emoji", async () => {
      await conversationHandlers.sendReaction?.({
        ctx,
        data: {
          contact,
          emoji: "🔥",
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
        recipient_type: "individual",
        to: "84123456789",
        type: "reaction",
        reaction: {
          message_id: "wamid.HBgLMTIzNDU2Nzg5FQIAEhgg",
          emoji: "🔥",
        },
      })
    })

    test("handles API errors gracefully without throwing", async () => {
      mockApiFetch.mockRejectedValue(new Error("Reaction failed"))

      await expect(
        conversationHandlers.sendReaction?.({
          ctx,
          data: {
            contact,
            emoji: "❤️",
            messageId: "wamid.123",
          },
        } as never),
      ).resolves.not.toThrow()
    })
  })
})
