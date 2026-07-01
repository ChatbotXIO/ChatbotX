import { EVENT_BUS_MESSAGE_ID } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const capturedInsertValues: unknown[] = []

const insertChain = {
  onConflictDoNothing: vi.fn(async () => undefined),
  values: vi.fn((values: unknown) => {
    capturedInsertValues.push(values)
    return insertChain
  }),
}

const dbInsert = vi.fn(() => insertChain)

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    execute: vi.fn(async () => ({ rows: [] })),
    insert: dbInsert,
  },
  sql: Object.assign((...args: unknown[]) => ({ sql: args }), {
    join: (...args: unknown[]) => ({ join: args }),
  }),
}))

vi.mock("@chatbotx.io/database/schema", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/database/schema")>()
  return {
    ...actual,
    analyticsBotMessageEventModel: { name: "AnalyticsBotMessageEvent" },
    analyticsContactEventModel: { name: "AnalyticsContactEvent" },
    analyticsConversationEventModel: { name: "AnalyticsConversationEvent" },
    analyticsMessageEventModel: { name: "AnalyticsMessageEvent" },
  }
})

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: vi.fn(() => "generated-id"),
  }
})

const { botMessageStatsRepository } = await import(
  "../src/repositories/postgres/bot-message-stats.repository"
)
const { contactStatsRepository } = await import(
  "../src/repositories/postgres/contact-stats.repository"
)
const { contactAnalyticsService } = await import(
  "../src/services/contact-analytics.service"
)
const { conversationStatsRepository } = await import(
  "../src/repositories/postgres/conversation-stats.repository"
)
const { messageStatsRepository } = await import(
  "../src/repositories/postgres/message-stats.repository"
)

beforeEach(() => {
  capturedInsertValues.length = 0
  dbInsert.mockClear()
  insertChain.values.mockClear()
  insertChain.onConflictDoNothing.mockClear()
})

describe("analytics event-bus idempotency", () => {
  test("uses the event-bus stream id as contact eventId", async () => {
    await contactStatsRepository.insertEvents(
      [
        {
          workspaceId: "ws-1",
          contactId: "contact-1",
          occurredAt: "2026-07-01T00:00:00.000Z",
          [EVENT_BUS_MESSAGE_ID]: "stream-1-0",
        },
      ],
      "contact_created",
    )

    expect(capturedInsertValues[0]).toMatchObject([{ eventId: "stream-1-0" }])
  })

  test("uses the event-bus stream id as conversation eventId", async () => {
    await conversationStatsRepository.insertEvents(
      [
        {
          workspaceId: "ws-1",
          conversationId: "conversation-1",
          occurredAt: "2026-07-01T00:00:00.000Z",
          [EVENT_BUS_MESSAGE_ID]: "stream-2-0",
        },
      ],
      "conversation_created",
    )

    expect(capturedInsertValues[0]).toMatchObject([{ eventId: "stream-2-0" }])
  })

  test("uses the event-bus stream id as message eventId", async () => {
    await messageStatsRepository.insertEvents(
      [
        {
          workspaceId: "ws-1",
          contactId: "contact-1",
          occurredAt: "2026-07-01T00:00:00.000Z",
          [EVENT_BUS_MESSAGE_ID]: "stream-3-0",
        },
      ],
      "message_human_sent",
    )

    expect(capturedInsertValues[0]).toMatchObject([{ eventId: "stream-3-0" }])
  })

  test("uses the event-bus stream id as bot-message eventId", async () => {
    await botMessageStatsRepository.insertEvents([
      {
        workspaceId: "ws-1",
        messageId: "message-1",
        conversationId: "conversation-1",
        occurredAt: "2026-07-01T00:00:00.000Z",
        hasResponse: true,
        [EVENT_BUS_MESSAGE_ID]: "stream-4-0",
      },
    ])

    expect(capturedInsertValues[0]).toMatchObject([{ eventId: "stream-4-0" }])
  })

  test("falls back to generated ids when stream id metadata is absent", async () => {
    await contactStatsRepository.insertEvents(
      [
        {
          workspaceId: "ws-1",
          contactId: "contact-1",
          occurredAt: "2026-07-01T00:00:00.000Z",
        },
      ],
      "contact_created",
    )

    expect(capturedInsertValues[0]).toMatchObject([{ eventId: "generated-id" }])
  })

  test("preserves stream id metadata through the contact analytics service", async () => {
    await contactAnalyticsService.recordEvents(
      [
        {
          workspaceId: "ws-1",
          contactId: "contact-1",
          occurredAt: "2026-07-01T00:00:00.000Z",
          [EVENT_BUS_MESSAGE_ID]: "stream-service-1-0",
        },
      ],
      "contact_created",
    )

    expect(capturedInsertValues[0]).toMatchObject([
      { eventId: "stream-service-1-0" },
    ])
  })
})
