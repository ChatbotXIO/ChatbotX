import type { MessageFailedPayload } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("../src/repositories/postgres", () => ({
  contactStatsRepository: {
    insertEvents: vi.fn(async () => undefined),
  },
}))

const transitionResult: { current: { id: string }[] } = { current: [] }

vi.mock("@chatbotx.io/database/client", () => {
  const builder: Record<string, unknown> = {}
  builder.set = vi.fn(() => builder)
  builder.where = vi.fn(() => builder)
  builder.returning = vi.fn(async () => transitionResult.current)
  return {
    db: { update: vi.fn(() => builder) },
    and: (...args: unknown[]) => args,
    inArray: (...args: unknown[]) => args,
    isNull: (...args: unknown[]) => args,
  }
})

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: { id: "id", blockedAt: "blockedAt" },
}))

const { contactStatsRepository } = await import("../src/repositories/postgres")
const { contactAnalyticsService } = await import(
  "../src/services/contact-analytics.service"
)

const insertEvents = contactStatsRepository.insertEvents as ReturnType<
  typeof vi.fn
>

function makePayload(
  errorData: unknown,
  contactId = "c-1",
): MessageFailedPayload {
  return {
    context: {
      workspaceId: "ws-1",
      contactId,
      conversationId: "conv-1",
      channel: "messenger",
    },
    action: {},
    occurredAt: new Date("2026-05-17T00:00:00Z"),
    errorData,
  } as MessageFailedPayload
}

describe("ContactAnalyticsService.onMessageFailed", () => {
  beforeEach(() => {
    insertEvents.mockClear()
    transitionResult.current = [{ id: "c-1" }, { id: "c-2" }]
  })

  test("inserts contact_blocked event when category is user_blocked", async () => {
    await contactAnalyticsService.onMessageFailed([
      makePayload({
        code: 551,
        statusCode: 400,
        subcode: 0,
        message: "blocked",
        category: "user_blocked",
        isPermanent: true,
        isRetryable: false,
      }),
    ])

    expect(insertEvents).toHaveBeenCalledTimes(1)
    const [rows, eventType] = insertEvents.mock.calls[0] ?? []
    expect(eventType).toBe("contact_blocked")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      workspaceId: "ws-1",
      contactId: "c-1",
      channel: "messenger",
    })
    const triggerContext = (rows[0].metadata as Record<string, unknown>)
      .triggerContext as Record<string, unknown>
    expect(triggerContext.origin).toBe("auto_detected")
    expect(triggerContext.errorCategory).toBe("user_blocked")
    expect(triggerContext.errorCode).toBe(551)
  })

  test("skips payloads with non-blocked category", async () => {
    await contactAnalyticsService.onMessageFailed([
      makePayload({
        code: 429,
        statusCode: 429,
        subcode: 0,
        message: "slow down",
        category: "rate_limited",
      }),
    ])

    expect(insertEvents).not.toHaveBeenCalled()
  })

  test("skips payloads with unparseable errorData", async () => {
    await contactAnalyticsService.onMessageFailed([
      makePayload(null),
      makePayload("string-error"),
      makePayload({ random: "shape" }),
    ])

    expect(insertEvents).not.toHaveBeenCalled()
  })

  test("filters mixed batch and only inserts blocked rows", async () => {
    await contactAnalyticsService.onMessageFailed([
      makePayload({
        code: 429,
        statusCode: 429,
        subcode: 0,
        message: "rate",
        category: "rate_limited",
      }),
      makePayload(
        {
          code: 551,
          statusCode: 400,
          subcode: 0,
          message: "blocked",
          category: "user_blocked",
        },
        "c-1",
      ),
      makePayload(
        {
          code: 200,
          statusCode: 403,
          subcode: 1_545_041,
          message: "opted out",
          category: "user_blocked",
        },
        "c-2",
      ),
    ])

    expect(insertEvents).toHaveBeenCalledTimes(1)
    const [rows] = insertEvents.mock.calls[0] ?? []
    expect(rows).toHaveLength(2)
  })

  test("dedups duplicate failed payloads for same contact", async () => {
    transitionResult.current = [{ id: "c-1" }]
    await contactAnalyticsService.onMessageFailed([
      makePayload({
        code: 551,
        statusCode: 400,
        subcode: 0,
        message: "blocked",
        category: "user_blocked",
      }),
      makePayload({
        code: 551,
        statusCode: 400,
        subcode: 0,
        message: "blocked",
        category: "user_blocked",
      }),
      makePayload({
        code: 551,
        statusCode: 400,
        subcode: 0,
        message: "blocked",
        category: "user_blocked",
      }),
    ])

    expect(insertEvents).toHaveBeenCalledTimes(1)
    const [rows] = insertEvents.mock.calls[0] ?? []
    expect(rows).toHaveLength(1)
  })

  test("skips when contact already blocked (no transition)", async () => {
    transitionResult.current = []
    await contactAnalyticsService.onMessageFailed([
      makePayload({
        code: 551,
        statusCode: 400,
        subcode: 0,
        message: "blocked",
        category: "user_blocked",
      }),
    ])

    expect(insertEvents).not.toHaveBeenCalled()
  })

  test("no-op on empty array", async () => {
    await contactAnalyticsService.onMessageFailed([])
    expect(insertEvents).not.toHaveBeenCalled()
  })
})
