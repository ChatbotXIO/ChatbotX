import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  handleBotMessageSent: vi.fn(async () => undefined),
  handleContactBlocked: vi.fn(async () => undefined),
  handleContactCreated: vi.fn(async () => undefined),
  handleContactDeleted: vi.fn(async () => undefined),
  handleConversationArchived: vi.fn(async () => undefined),
  handleConversationAssigned: vi.fn(async () => undefined),
  handleConversationCreated: vi.fn(async () => undefined),
  handleConversationFollowed: vi.fn(async () => undefined),
  handleConversationTransferredToBot: vi.fn(async () => undefined),
  handleConversationTransferredToHuman: vi.fn(async () => undefined),
  handleConversationUnarchived: vi.fn(async () => undefined),
  handleConversationUnassigned: vi.fn(async () => undefined),
  handleConversationUnfollowed: vi.fn(async () => undefined),
  handleHumanMessageSent: vi.fn(async () => undefined),
  handleMessageBotReceived: vi.fn(async () => undefined),
  loggerDebug: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  EVENT_BUS_MESSAGE_ID: "__eventBusMessageId",
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    debug: mocks.loggerDebug,
    error: mocks.loggerError,
  },
}))

vi.mock("../src/events/analytics/contact", () => ({
  handleContactBlocked: mocks.handleContactBlocked,
  handleContactCreated: mocks.handleContactCreated,
  handleContactDeleted: mocks.handleContactDeleted,
}))

vi.mock("../src/events/analytics/conversation", () => ({
  handleConversationArchived: mocks.handleConversationArchived,
  handleConversationAssigned: mocks.handleConversationAssigned,
  handleConversationCreated: mocks.handleConversationCreated,
  handleConversationFollowed: mocks.handleConversationFollowed,
  handleConversationTransferredToBot: mocks.handleConversationTransferredToBot,
  handleConversationTransferredToHuman:
    mocks.handleConversationTransferredToHuman,
  handleConversationUnarchived: mocks.handleConversationUnarchived,
  handleConversationUnassigned: mocks.handleConversationUnassigned,
  handleConversationUnfollowed: mocks.handleConversationUnfollowed,
}))

vi.mock("../src/events/analytics/message", () => ({
  handleBotMessageSent: mocks.handleBotMessageSent,
  handleHumanMessageSent: mocks.handleHumanMessageSent,
}))

vi.mock("../src/events/analytics/bot-message", () => ({
  handleMessageBotReceived: mocks.handleMessageBotReceived,
}))

const { analyticsDashboardListeners } = await import(
  "../src/events/analytics/listener"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.handleContactCreated.mockResolvedValue(undefined)
})

describe("analyticsDashboardListeners", () => {
  test("logs sub-handler timing and returns failed stream ids when a grouped handler fails", async () => {
    mocks.handleContactCreated.mockRejectedValueOnce(new Error("insert failed"))
    const listener = analyticsDashboardListeners["analytics:dashboard"]?.[0]

    const result = await listener?.handler?.([
      {
        __eventBusMessageId: "1-0",
        eventType: "contact:created",
      } as never,
    ])

    expect(result).toEqual({ failedMessageIds: ["1-0"] })
    expect(mocks.loggerError).toHaveBeenCalledWith(
      { err: expect.any(Error), eventType: "contact:created", count: 1 },
      "[analytics] dashboard handler failed",
    )
    expect(mocks.loggerDebug).toHaveBeenCalledWith(
      {
        count: 1,
        durationMs: expect.any(Number),
        eventType: "contact:created",
        success: false,
      },
      "[analytics] dashboard sub-handler processed",
    )
  })

  test("returns only the failed sub-handler stream ids from a mixed batch", async () => {
    mocks.handleContactCreated.mockRejectedValueOnce(new Error("insert failed"))
    const listener = analyticsDashboardListeners["analytics:dashboard"]?.[0]

    const result = await listener?.handler?.([
      {
        __eventBusMessageId: "1-0",
        eventType: "contact:created",
      } as never,
      {
        __eventBusMessageId: "2-0",
        eventType: "message:human_sent",
      } as never,
    ])

    expect(result).toEqual({ failedMessageIds: ["1-0"] })
    expect(mocks.handleContactCreated).toHaveBeenCalledTimes(1)
    expect(mocks.handleHumanMessageSent).toHaveBeenCalledTimes(1)
  })

  test("observes an already-aborted signal before starting a sub-handler", async () => {
    const abortController = new AbortController()
    abortController.abort()
    const listener = analyticsDashboardListeners["analytics:dashboard"]?.[0]

    const result = await listener?.handler?.(
      [
        {
          __eventBusMessageId: "3-0",
          eventType: "contact:created",
        } as never,
      ],
      abortController.signal,
    )

    expect(result).toEqual({ failedMessageIds: ["3-0"] })
    expect(mocks.handleContactCreated).not.toHaveBeenCalled()
  })
})
