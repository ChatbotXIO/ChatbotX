import { describe, expect, test, vi } from "vitest"

const mockSendMessage = vi.fn()

vi.mock("../src/client", () => ({
  getWhatsappClient: vi.fn(() => ({
    $$apiFetch$$: vi.fn(),
    sendMessage: mockSendMessage,
  })),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { sendFlowStep, sendMessage } = await import(
  "../src/handlers/message/outgoing-message"
)

const ctx = { auth: { metadata: { phoneNumber: { id: "pn-1" } } } } as never
const HOUR = 60 * 60 * 1000
const contactLastSeen = (ms: number) =>
  ({
    id: "c1",
    sourceId: "84123456789",
    lastIncomingMessageAt: new Date(Date.now() - ms),
  }) as never

const run = (ms: number, sendFrom: "inbox" | "api" | undefined) =>
  sendMessage({
    ctx,
    data: {
      contact: contactLastSeen(ms),
      message: { text: "hi", contentType: "text" },
      sendFrom,
    },
  } as never)

describe("WhatsApp sendMessage — messaging window", () => {
  test.each([
    "inbox",
    "api",
  ] as const)("refuses a %s send after 24h with whatsapp_messaging_window_closed", async (sendFrom) => {
    await expect(run(25 * HOUR, sendFrom)).rejects.toMatchObject({
      code: "whatsapp_messaging_window_closed",
    })
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  test("leaves automation untouched", async () => {
    mockSendMessage.mockResolvedValue({ messages: [{ id: "wamid.1" }] })
    await run(25 * HOUR, undefined)
    expect(mockSendMessage).toHaveBeenCalled()
  })

  test("refuses a closed-window manual flow step", async () => {
    await expect(
      sendFlowStep({
        ctx,
        data: {
          contact: contactLastSeen(25 * HOUR),
          step: { stepType: "sendText", content: "hi" },
          sendFrom: "inbox",
        },
      } as never),
    ).rejects.toMatchObject({ code: "whatsapp_messaging_window_closed" })
  })
})
