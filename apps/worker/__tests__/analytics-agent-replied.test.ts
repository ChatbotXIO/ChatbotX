import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  recordEvents: vi.fn(async () => undefined),
  warn: vi.fn(),
}))

vi.mock("@chatbotx.io/analytics", () => ({
  agentResponseAnalyticsService: { recordEvents: mocks.recordEvents },
}))
vi.mock("../src/lib/logger", () => ({ logger: { warn: mocks.warn } }))

const { handleAgentReplied } = await import(
  "../src/events/analytics/agent-response"
)

const payload = (overrides: Record<string, unknown> = {}) =>
  ({
    eventType: "agent:replied",
    eventId: "reply:m-1",
    workspaceId: "ws-1",
    conversationId: "c-1",
    contactId: "ct-1",
    adminId: "u-1",
    occurredAt: "2026-01-01T10:00:00.000Z",
    awaitingSince: "2026-01-01T09:00:00.000Z",
    measuredFrom: "2026-01-01T09:30:00.000Z",
    responseSeconds: 1800,
    workingResponseSeconds: 600,
    workingHoursId: "wh-1",
    isFirstResponse: true,
    ...overrides,
  }) as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe("handleAgentReplied", () => {
  test("inserts valid rows through the service", async () => {
    const row = payload()
    await handleAgentReplied([row])
    expect(mocks.recordEvents).toHaveBeenCalledWith([row])
    expect(mocks.warn).not.toHaveBeenCalled()
  })

  test("keeps the producer eventId so a redelivery maps to the same idempotent key", async () => {
    await handleAgentReplied([payload(), payload()])
    const rows = mocks.recordEvents.mock.calls[0]?.[0] as unknown as {
      eventId: string
    }[]
    expect(rows.map((r) => r.eventId)).toEqual(["reply:m-1", "reply:m-1"])
  })

  test("drops measuredFrom >= occurredAt and negative seconds with a warning", async () => {
    const good = payload({ eventId: "reply:ok" })
    await handleAgentReplied([
      payload({
        eventId: "reply:eq",
        measuredFrom: "2026-01-01T10:00:00.000Z",
      }),
      payload({
        eventId: "reply:after",
        measuredFrom: "2026-01-01T11:00:00.000Z",
      }),
      payload({ eventId: "reply:neg", responseSeconds: -1 }),
      payload({ eventId: "reply:negw", workingResponseSeconds: -5 }),
      good,
    ])

    expect(mocks.warn).toHaveBeenCalledTimes(4)
    expect(mocks.warn).toHaveBeenCalledWith(
      { workspaceId: "ws-1", conversationId: "c-1", eventId: "reply:eq" },
      expect.any(String),
    )
    expect(mocks.recordEvents).toHaveBeenCalledWith([good])
  })

  test("drops unparseable timestamps with a warning and still inserts valid rows", async () => {
    const good = payload({ eventId: "reply:ok" })
    await handleAgentReplied([
      payload({ eventId: "reply:g1", occurredAt: "garbage" }),
      payload({ eventId: "reply:g2", measuredFrom: "garbage" }),
      payload({ eventId: "reply:g3", awaitingSince: "garbage" }),
      good,
    ])

    expect(mocks.warn).toHaveBeenCalledTimes(3)
    expect(mocks.warn).toHaveBeenCalledWith(
      { workspaceId: "ws-1", conversationId: "c-1", eventId: "reply:g1" },
      expect.any(String),
    )
    expect(mocks.recordEvents).toHaveBeenCalledWith([good])
  })

  test("does not call the service when every row is invalid", async () => {
    await handleAgentReplied([payload({ responseSeconds: -1 })])
    expect(mocks.recordEvents).not.toHaveBeenCalled()
  })

  test("propagates insert failures so the listener retries the stream ids", async () => {
    mocks.recordEvents.mockRejectedValueOnce(new Error("db down"))
    await expect(handleAgentReplied([payload()])).rejects.toThrow("db down")
  })
})
