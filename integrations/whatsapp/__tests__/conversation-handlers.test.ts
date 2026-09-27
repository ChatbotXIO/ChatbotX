import { beforeEach, describe, expect, test, vi } from "vitest"

const { mockMarkAsRead, mockGetWhatsappClient } = vi.hoisted(() => {
  const markAsRead = vi.fn().mockResolvedValue({ success: true })
  return {
    mockMarkAsRead: markAsRead,
    mockGetWhatsappClient: vi.fn(() => ({ markAsRead })),
  }
})

vi.mock("../src/client", () => ({
  getWhatsappClient: mockGetWhatsappClient,
}))

const { conversationHandlers } = await import("../src/handlers/conversation")

const ctx = {
  auth: { metadata: { phoneNumber: { id: "pn-1" } } },
} as never
const contact = { id: "ci-1", sourceId: "84123456789" } as never

describe("whatsapp conversation handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("agentMarkAsRead marks the given wamid read", async () => {
    await conversationHandlers.agentMarkAsRead({
      ctx,
      data: { contact, messageSourceId: "wamid.abc" },
    } as never)

    expect(mockMarkAsRead).toHaveBeenCalledWith("pn-1", "wamid.abc")
  })

  test("agentMarkAsRead is a no-op without a wamid", async () => {
    await conversationHandlers.agentMarkAsRead({
      ctx,
      data: { contact },
    } as never)

    expect(mockMarkAsRead).not.toHaveBeenCalled()
  })

  test("sendTyping sends a text typing indicator on the given wamid", async () => {
    await conversationHandlers.sendTyping({
      ctx,
      data: { contact, typing: true, messageSourceId: "wamid.abc" },
    } as never)

    expect(mockMarkAsRead).toHaveBeenCalledWith("pn-1", "wamid.abc", "text")
  })

  test("sendTyping is a no-op without a wamid or when typing is off", async () => {
    await conversationHandlers.sendTyping({
      ctx,
      data: { contact, typing: true },
    } as never)
    await conversationHandlers.sendTyping({
      ctx,
      data: { contact, typing: false, messageSourceId: "wamid.abc" },
    } as never)

    expect(mockMarkAsRead).not.toHaveBeenCalled()
  })
})
