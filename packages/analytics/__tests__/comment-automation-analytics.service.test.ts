import { beforeEach, describe, expect, test, vi } from "vitest"

// ── db mock ──────────────────────────────────────────────────────────────────

const findFirstAutomation = vi.fn()
const findManyContacts = vi.fn()

const db = {
  query: {
    fbCommentAutomationModel: { findFirst: findFirstAutomation },
    contactModel: { findMany: findManyContacts },
  },
}

vi.mock("@chatbotx.io/database/client", () => ({ db }))

// ── repository mock ───────────────────────────────────────────────────────────

const commentAutomationStatsRepository = {
  insertEvents: vi.fn().mockResolvedValue(undefined),
  settleEvent: vi.fn().mockResolvedValue(undefined),
  deleteEvent: vi.fn().mockResolvedValue(undefined),
  getRepliesByDate: vi.fn(),
  getUserCommentTotals: vi.fn(),
  getBotReplyTotals: vi.fn(),
  getErrorEvents: vi.fn(),
}

vi.mock(
  "../src/repositories/postgres/comment-automation-stats.repository",
  () => ({ commentAutomationStatsRepository }),
)

// ── subject ───────────────────────────────────────────────────────────────────

const { CommentAutomationAnalyticsService } = await import(
  "../src/services/comment-automation-analytics.service"
)

const service = new CommentAutomationAnalyticsService()

const RANGE = {
  workspaceId: "workspace-1",
  automationId: "automation-1",
  startDate: "2026-03-01T00:00:00.000Z",
  endDate: "2026-03-03T23:59:59.999Z",
  timezone: "UTC",
}
const PAGED = { ...RANGE, page: 1, perPage: 10 }

beforeEach(() => {
  vi.clearAllMocks()
  findFirstAutomation.mockResolvedValue({ id: "automation-1" })
  findManyContacts.mockResolvedValue([])
})

describe("automation scoping", () => {
  test("returns empty and runs no stat query when the automation is not in the workspace", async () => {
    findFirstAutomation.mockResolvedValue(undefined)

    const stats = await service.getReplyStatsByDateRange(RANGE)
    const comments = await service.listUserComments(PAGED)

    expect(stats).toEqual([])
    expect(comments).toEqual({ data: [], total: 0, page: 1, pageCount: 0 })
    expect(
      commentAutomationStatsRepository.getRepliesByDate,
    ).not.toHaveBeenCalled()
    expect(
      commentAutomationStatsRepository.getUserCommentTotals,
    ).not.toHaveBeenCalled()
  })

  test("scopes the lookup by both workspace and automation", async () => {
    commentAutomationStatsRepository.getRepliesByDate.mockResolvedValue([])

    await service.getReplyStatsByDateRange(RANGE)

    expect(findFirstAutomation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "automation-1", workspaceId: "workspace-1" },
      }),
    )
  })

  test("treats a blank automationId as no match without querying", async () => {
    const stats = await service.getReplyStatsByDateRange({
      ...RANGE,
      automationId: "",
    })

    expect(stats).toEqual([])
    expect(findFirstAutomation).not.toHaveBeenCalled()
  })
})

describe("getReplyStatsByDateRange", () => {
  test("fills quiet days with zero so the chart draws a continuous line", async () => {
    commentAutomationStatsRepository.getRepliesByDate.mockResolvedValue([
      { dateReport: "2026-03-01", count: 4 },
      { dateReport: "2026-03-03", count: 2 },
    ])

    const stats = await service.getReplyStatsByDateRange(RANGE)

    expect(stats).toEqual([
      { dateReport: "2026-03-01", count: 4 },
      { dateReport: "2026-03-02", count: 0 },
      { dateReport: "2026-03-03", count: 2 },
    ])
  })
})

describe("recordEvent", () => {
  test("swallows a repository failure — analytics must not break the reply", async () => {
    commentAutomationStatsRepository.insertEvents.mockRejectedValueOnce(
      new Error("db down"),
    )

    await expect(
      service.recordEvent({
        workspaceId: "workspace-1",
        automationId: "automation-1",
        postId: "post-1",
        commentId: "comment-1",
        replyChannel: "public",
        replyType: "text",
        status: "sent",
        occurredAt: new Date(),
      }),
    ).resolves.toBeUndefined()
  })

  test("truncates an oversized error detail", async () => {
    await service.recordEvent({
      workspaceId: "workspace-1",
      automationId: "automation-1",
      postId: "post-1",
      commentId: "comment-1",
      replyChannel: "private",
      replyType: "text",
      status: "failed",
      errorDetail: "x".repeat(9000),
      occurredAt: new Date(),
    })

    const [rows] = commentAutomationStatsRepository.insertEvents.mock.calls[0]
    expect(rows[0].errorDetail).toHaveLength(8192)
  })
})

describe("settleEvent", () => {
  test("omitting replyText leaves the column alone — a failed send keeps the text it carried", async () => {
    await service.settleEvent({
      automationId: "automation-1",
      commentId: "comment-1",
      replyChannel: "public",
      status: "failed",
      errorDetail: "token revoked",
    })

    const [input] = commentAutomationStatsRepository.settleEvent.mock.calls[0]
    expect(input).not.toHaveProperty("replyText")
    expect(input.errorDetail).toBe("token revoked")
  })

  test("an explicit null still clears the column", async () => {
    await service.settleEvent({
      automationId: "automation-1",
      commentId: "comment-1",
      replyChannel: "public",
      status: "failed",
      replyText: null,
    })

    const [input] = commentAutomationStatsRepository.settleEvent.mock.calls[0]
    expect(input.replyText).toBeNull()
  })

  test("truncates an oversized error detail", async () => {
    await service.settleEvent({
      automationId: "automation-1",
      commentId: "comment-1",
      replyChannel: "private",
      status: "failed",
      errorDetail: "x".repeat(9000),
    })

    const [input] = commentAutomationStatsRepository.settleEvent.mock.calls[0]
    expect(input.errorDetail).toHaveLength(8192)
  })

  test("swallows a repository failure", async () => {
    commentAutomationStatsRepository.settleEvent.mockRejectedValueOnce(
      new Error("db down"),
    )

    await expect(
      service.settleEvent({
        automationId: "automation-1",
        commentId: "comment-1",
        replyChannel: "public",
        status: "sent",
      }),
    ).resolves.toBeUndefined()
  })
})

describe("discardEvent", () => {
  test("deletes the row a deliberate skip opened", async () => {
    await service.discardEvent({
      automationId: "automation-1",
      commentId: "comment-1",
      replyChannel: "public",
    })

    expect(commentAutomationStatsRepository.deleteEvent).toHaveBeenCalledWith({
      automationId: "automation-1",
      commentId: "comment-1",
      replyChannel: "public",
    })
  })

  test("swallows a repository failure", async () => {
    commentAutomationStatsRepository.deleteEvent.mockRejectedValueOnce(
      new Error("db down"),
    )

    await expect(
      service.discardEvent({
        automationId: "automation-1",
        commentId: "comment-1",
        replyChannel: "public",
      }),
    ).resolves.toBeUndefined()
  })
})

describe("listErrors", () => {
  test("hydrates contact names and leaves a deleted contact null", async () => {
    commentAutomationStatsRepository.getErrorEvents.mockResolvedValue({
      rows: [
        {
          id: "1",
          contactId: "contact-1",
          replyChannel: "public",
          replyType: "text",
          errorDetail: "boom",
          httpCode: "400",
          commentText: "hello",
          occurredAt: new Date("2026-03-01T10:00:00.000Z"),
        },
        {
          id: "2",
          contactId: null,
          replyChannel: "private",
          replyType: "text",
          errorDetail: "boom",
          httpCode: null,
          commentText: null,
          occurredAt: new Date("2026-03-01T11:00:00.000Z"),
        },
      ],
      total: 2,
    })
    findManyContacts.mockResolvedValue([
      { id: "contact-1", firstName: "Ada", lastName: "L", avatar: null },
    ])

    const result = await service.listErrors(PAGED)

    expect(result.data[0]?.contact).toEqual({
      firstName: "Ada",
      lastName: "L",
      avatar: null,
    })
    expect(result.data[1]?.contact).toBeNull()
    expect(result.pageCount).toBe(1)
  })

  test("skips the contact query when no row has a contact", async () => {
    commentAutomationStatsRepository.getErrorEvents.mockResolvedValue({
      rows: [
        {
          id: "1",
          contactId: null,
          replyChannel: "public",
          replyType: "text",
          errorDetail: "boom",
          httpCode: null,
          commentText: null,
          occurredAt: new Date("2026-03-01T10:00:00.000Z"),
        },
      ],
      total: 1,
    })

    await service.listErrors(PAGED)

    expect(findManyContacts).not.toHaveBeenCalled()
  })
})
