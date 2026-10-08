import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  sendTypingToChannel: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../src/chat/handlers/send-message", () => ({
  sendTypingToChannel: (...args: unknown[]) =>
    mocks.sendTypingToChannel(...args),
  resolveWhatsappMessageSourceId: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: {},
  contactService: {},
  conversationService: {},
  inboxTeamService: {},
  workspaceMemberService: {},
}))

vi.mock("../src/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { stepSendTyping } = await import(
  "../src/integration/handlers/step-handlers"
)

describe("stepSendTyping", () => {
  const conversation = {
    id: "conv-1",
    workspaceId: "ws-1",
    contactId: "contact-1",
  }
  const contactInbox = {
    id: "ci-1",
    channel: "whatsapp",
    sourceId: "84123456789",
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("sends typing once and waits for short delays", async () => {
    const stepPromise = stepSendTyping({
      conversation,
      contactInbox,
      step: {
        id: "step-1",
        stepType: "typing",
        seconds: 2,
      },
    } as never)

    await vi.advanceTimersByTimeAsync(2000)
    await stepPromise

    expect(mocks.sendTypingToChannel).toHaveBeenCalledTimes(1)
    expect(mocks.sendTypingToChannel).toHaveBeenCalledWith({
      conversation,
      contactInbox,
      typing: true,
      seconds: 2,
    })
  })

  test("refreshes typing before Meta's 25 second window for longer delays", async () => {
    const stepPromise = stepSendTyping({
      conversation,
      contactInbox,
      step: {
        id: "step-2",
        stepType: "typing",
        seconds: 30,
      },
    } as never)

    await vi.advanceTimersByTimeAsync(20_000)
    expect(mocks.sendTypingToChannel).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(10_000)
    await stepPromise

    expect(mocks.sendTypingToChannel).toHaveBeenCalledTimes(2)
  })
})
