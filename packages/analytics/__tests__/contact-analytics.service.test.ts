import type { MessageFailedPayload } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"

const transitionResult: { current: { id: string }[] } = { current: [] }

vi.mock("../src/repositories/postgres", () => ({
  contactStatsRepository: {
    insertEvents: vi.fn(async () => undefined),
  },
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  contactRepository: {
    blockManyIfNotBlocked: vi.fn(async () => transitionResult.current),
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(async () => undefined),
}))

const { contactStatsRepository } = await import("../src/repositories/postgres")
const { contactRepository } = await import("@chatbotx.io/database/repositories")
const { invalidateCacheByTags } = await import("@chatbotx.io/redis")
const { contactAnalyticsService } = await import(
  "../src/services/contact-analytics.service"
)

const insertEvents = contactStatsRepository.insertEvents as ReturnType<
  typeof vi.fn
>
const blockManyIfNotBlocked =
  contactRepository.blockManyIfNotBlocked as ReturnType<typeof vi.fn>
const invalidateCacheByTagsMock = invalidateCacheByTags as ReturnType<
  typeof vi.fn
>

function makePayload(
  errorData: unknown,
  contactId = "c-1",
  workspaceId = "ws-1",
): MessageFailedPayload {
  return {
    context: {
      workspaceId,
      contactId,
      conversationId: "conv-1",
      channel: "messenger",
    },
    action: {},
    occurredAt: new Date("2026-05-17T00:00:00Z"),
    errorData,
  } as MessageFailedPayload
}

const USER_BLOCKED_ERROR = {
  code: 551,
  statusCode: 400,
  subcode: 0,
  message: "blocked",
  category: "user_blocked",
}

describe("ContactAnalyticsService.handleBlocked", () => {
  beforeEach(() => {
    insertEvents.mockClear()
    blockManyIfNotBlocked.mockClear()
    invalidateCacheByTagsMock.mockClear()
    transitionResult.current = [{ id: "c-1" }, { id: "c-2" }]
    blockManyIfNotBlocked.mockImplementation(
      async () => transitionResult.current,
    )
  })

  test("inserts contact_blocked event when category is user_blocked", async () => {
    await contactAnalyticsService.handleBlocked([
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
    await contactAnalyticsService.handleBlocked([
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
    await contactAnalyticsService.handleBlocked([
      makePayload(null),
      makePayload("string-error"),
      makePayload({ random: "shape" }),
    ])

    expect(insertEvents).not.toHaveBeenCalled()
  })

  test("filters mixed batch and only inserts blocked rows", async () => {
    await contactAnalyticsService.handleBlocked([
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
    await contactAnalyticsService.handleBlocked([
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
    await contactAnalyticsService.handleBlocked([
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
    await contactAnalyticsService.handleBlocked([])
    expect(insertEvents).not.toHaveBeenCalled()
  })

  test("scopes the block write to the payload's workspace", async () => {
    transitionResult.current = [{ id: "c-1" }]
    await contactAnalyticsService.handleBlocked([
      makePayload(USER_BLOCKED_ERROR, "c-1", "ws-1"),
    ])

    expect(blockManyIfNotBlocked).toHaveBeenCalledTimes(1)
    expect(blockManyIfNotBlocked).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["c-1"],
    })
  })

  test("splits a mixed-workspace batch into one scoped call per workspace", async () => {
    blockManyIfNotBlocked.mockImplementation(
      async (props: { workspaceId: string; ids: string[] }) =>
        props.ids.map((id) => ({ id })),
    )

    await contactAnalyticsService.handleBlocked([
      makePayload(USER_BLOCKED_ERROR, "c-1", "ws-1"),
      makePayload(USER_BLOCKED_ERROR, "c-2", "ws-2"),
    ])

    expect(blockManyIfNotBlocked).toHaveBeenCalledTimes(2)
    expect(blockManyIfNotBlocked).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["c-1"],
    })
    expect(blockManyIfNotBlocked).toHaveBeenCalledWith({
      workspaceId: "ws-2",
      ids: ["c-2"],
    })

    expect(insertEvents).toHaveBeenCalledTimes(1)
    const [rows] = insertEvents.mock.calls[0] ?? []
    expect(rows).toHaveLength(2)
  })

  test("invalidates contact cache tags for transitioned contacts only", async () => {
    transitionResult.current = [{ id: "c-1" }]
    await contactAnalyticsService.handleBlocked([
      makePayload(USER_BLOCKED_ERROR, "c-1", "ws-1"),
    ])

    expect(invalidateCacheByTagsMock).toHaveBeenCalledTimes(1)
    expect(invalidateCacheByTagsMock).toHaveBeenCalledWith([
      "contacts",
      "contacts:ws-1",
      "contacts:c-1",
    ])
  })

  test("does not invalidate cache when nothing transitions", async () => {
    transitionResult.current = []
    await contactAnalyticsService.handleBlocked([
      makePayload(USER_BLOCKED_ERROR, "c-1", "ws-1"),
    ])

    expect(invalidateCacheByTagsMock).not.toHaveBeenCalled()
  })
})
