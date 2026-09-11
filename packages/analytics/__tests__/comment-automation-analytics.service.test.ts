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
  insertEvents: vi.fn().mockResolvedValue([]),
  settleEvent: vi.fn().mockResolvedValue([]),
  deleteEvent: vi.fn().mockResolvedValue([]),
  markDelivered: vi.fn().mockResolvedValue([]),
  markSeenForContactInboxes: vi.fn().mockResolvedValue([]),
  markClickedForAutomationContacts: vi.fn().mockResolvedValue([]),
  incrementCounters: vi.fn().mockResolvedValue(undefined),
  getContacts: vi.fn(),
  getContactIdsPage: vi.fn(),
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
  commentAutomationStatsRepository.insertEvents.mockResolvedValue([])
  commentAutomationStatsRepository.settleEvent.mockResolvedValue([])
  commentAutomationStatsRepository.deleteEvent.mockResolvedValue([])
  commentAutomationStatsRepository.markDelivered.mockResolvedValue([])
  commentAutomationStatsRepository.markSeenForContactInboxes.mockResolvedValue(
    [],
  )
  commentAutomationStatsRepository.markClickedForAutomationContacts.mockResolvedValue(
    [],
  )
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

// ── lifetime counters ────────────────────────────────────────────────────────
//
// `FBCommentAutomationEvent` is purged after 30 days, so the numbers in the
// list table come from counters on `FBCommentAutomation` instead. Every
// increment is driven by the rows a conditional write actually returned — that
// is the only thing standing between these counters and a redelivered webhook.

const EVENT = {
  workspaceId: "workspace-1",
  automationId: "automation-1",
  postId: "post-1",
  commentId: "comment-1",
  replyChannel: "public" as const,
  replyType: "text" as const,
  occurredAt: new Date("2026-03-01T00:00:00.000Z"),
}

function countersFor(automationId: string) {
  const calls =
    commentAutomationStatsRepository.incrementCounters.mock.calls.at(-1)
  return (calls?.[0] as Map<string, Record<string, number>>)?.get(automationId)
}

describe("recordEvent counters", () => {
  test("counts one attempt per row that was actually inserted", async () => {
    commentAutomationStatsRepository.insertEvents.mockResolvedValue([
      { automationId: "automation-1", status: "sent" },
    ])

    await service.recordEvent({ ...EVENT, status: "sent" })

    expect(countersFor("automation-1")).toEqual({ sentCount: 1 })
  })

  test("a retry that hits the dedup index moves nothing", async () => {
    commentAutomationStatsRepository.insertEvents.mockResolvedValue([])

    await service.recordEvent({ ...EVENT, status: "sent" })

    expect(countersFor("automation-1")).toBeUndefined()
  })

  test("a row born failed counts as both an attempt and a failure", async () => {
    commentAutomationStatsRepository.insertEvents.mockResolvedValue([
      { automationId: "automation-1", status: "failed" },
    ])

    await service.recordEvent({ ...EVENT, status: "failed" })

    expect(countersFor("automation-1")).toEqual({
      sentCount: 1,
      failedCount: 1,
    })
  })

  test("stamps failedAt on a row that is failed from birth, so it can be ordered and drilled into", async () => {
    commentAutomationStatsRepository.insertEvents.mockResolvedValue([])

    await service.recordEvent({ ...EVENT, status: "failed" })

    const [rows] = commentAutomationStatsRepository.insertEvents.mock.calls[0]
    expect((rows as { failedAt: Date | null }[])[0].failedAt).toBeInstanceOf(
      Date,
    )
  })
})

describe("settleEvent counters", () => {
  test("counts the failure only when the row actually flipped", async () => {
    commentAutomationStatsRepository.settleEvent.mockResolvedValue([
      { automationId: "automation-1" },
    ])

    await service.settleEvent({
      automationId: "automation-1",
      commentId: "comment-1",
      replyChannel: "public",
      status: "failed",
    })

    expect(countersFor("automation-1")).toEqual({ failedCount: 1 })
  })

  test("a second settle to failed is refused by the repository and moves nothing", async () => {
    commentAutomationStatsRepository.settleEvent.mockResolvedValue([])

    await service.settleEvent({
      automationId: "automation-1",
      commentId: "comment-1",
      replyChannel: "public",
      status: "failed",
    })

    expect(countersFor("automation-1")).toBeUndefined()
  })

  test("an AI reply landing its text changes no counter — the attempt was already counted", async () => {
    commentAutomationStatsRepository.settleEvent.mockResolvedValue([
      { automationId: "automation-1" },
    ])

    await service.settleEvent({
      automationId: "automation-1",
      commentId: "comment-1",
      replyChannel: "private",
      status: "sent",
      replyText: "generated",
    })

    expect(
      commentAutomationStatsRepository.incrementCounters,
    ).not.toHaveBeenCalled()
  })
})

describe("discardEvent counters", () => {
  test("unwinds everything the discarded row had been counted as", async () => {
    commentAutomationStatsRepository.deleteEvent.mockResolvedValue([
      {
        automationId: "automation-1",
        status: "sent",
        deliveredAt: new Date(),
        seenAt: new Date(),
        clickedAt: null,
        failedAt: null,
      },
    ])

    await service.discardEvent({
      automationId: "automation-1",
      commentId: "comment-1",
      replyChannel: "private",
    })

    expect(countersFor("automation-1")).toEqual({
      sentCount: -1,
      deliveredCount: -1,
      seenCount: -1,
    })
  })
})

describe("markDelivered", () => {
  test("counts a delivery once, and not at all when the row was already delivered", async () => {
    commentAutomationStatsRepository.markDelivered.mockResolvedValue([
      { automationId: "automation-1" },
    ])
    await service.markDelivered({
      automationId: "automation-1",
      commentId: "comment-1",
      replyChannel: "public",
    })
    expect(countersFor("automation-1")).toEqual({ deliveredCount: 1 })

    commentAutomationStatsRepository.markDelivered.mockResolvedValue([])
    await service.markDelivered({
      automationId: "automation-1",
      commentId: "comment-1",
      replyChannel: "public",
    })
    expect(countersFor("automation-1")).toBeUndefined()
  })
})

describe("onSeen", () => {
  test("collapses several receipts for one inbox to its latest timestamp", async () => {
    const earlier = new Date("2026-03-01T10:00:00.000Z")
    const later = new Date("2026-03-01T11:00:00.000Z")

    await service.onSeen([
      { context: { contactInboxId: "inbox-1" }, occurredAt: later },
      { context: { contactInboxId: "inbox-1" }, occurredAt: earlier },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any)

    expect(
      commentAutomationStatsRepository.markSeenForContactInboxes,
    ).toHaveBeenCalledWith([{ contactInboxId: "inbox-1", occurredAt: later }])
  })

  test("never queries for a payload with no inbox — a receipt without one names nothing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await service.onSeen([{ context: {}, occurredAt: new Date() }] as any)

    expect(
      commentAutomationStatsRepository.markSeenForContactInboxes,
    ).not.toHaveBeenCalled()
  })
})

describe("onClicked", () => {
  test("ignores clicks from broadcasts and sequences, which carry no automation id", async () => {
    await service.onClicked([
      {
        action: { broadcastId: "broadcast-1" },
        context: { contactInboxId: "inbox-1" },
        occurredAt: new Date(),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any)

    expect(
      commentAutomationStatsRepository.markClickedForAutomationContacts,
    ).not.toHaveBeenCalled()
  })

  test("counts a click once per row the repository actually claimed", async () => {
    commentAutomationStatsRepository.markClickedForAutomationContacts.mockResolvedValue(
      [{ automationId: "automation-1" }],
    )

    await service.onClicked([
      {
        action: { commentAutomationId: "automation-1" },
        context: { contactInboxId: "inbox-1" },
        occurredAt: new Date("2026-03-01T10:00:00.000Z"),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any)

    expect(countersFor("automation-1")).toEqual({ clickedCount: 1 })
  })
})

describe("never-throws contract", () => {
  test("a counter write that fails does not take down the reply it was counting", async () => {
    commentAutomationStatsRepository.insertEvents.mockResolvedValue([
      { automationId: "automation-1", status: "sent" },
    ])
    commentAutomationStatsRepository.incrementCounters.mockRejectedValueOnce(
      new Error("connection lost"),
    )

    await expect(
      service.recordEvent({ ...EVENT, status: "sent" }),
    ).resolves.toBeUndefined()
  })
})

// A `flow` reply is several messages but ONE reply. `sendFlowStep` swallows a
// step's error and carries on, so a 3-step reply can settle in either order.
// The rule both ways round: any step through means delivered and not failed;
// only every step failing counts as a failure.
describe("multi-step flow reply: delivered and failed are mutually exclusive", () => {
  test("a later step failing after one landed is not counted — the reply arrived", async () => {
    // The repository refuses the write (`deliveredAt IS NULL` on the settle),
    // so there is nothing to count.
    commentAutomationStatsRepository.settleEvent.mockResolvedValue([])

    await service.settleEvent({
      automationId: "automation-1",
      commentId: "comment-1",
      replyChannel: "private",
      status: "failed",
      errorDetail: "step 3 threw",
    })

    expect(
      commentAutomationStatsRepository.incrementCounters,
    ).toHaveBeenCalledWith(new Map())
  })

  test("a step landing after an earlier one failed takes the failure back out", async () => {
    commentAutomationStatsRepository.markDelivered.mockResolvedValue([
      { automationId: "automation-1", clearedFailure: true },
    ])

    await service.markDelivered({
      automationId: "automation-1",
      commentId: "comment-1",
      replyChannel: "private",
    })

    expect(countersFor("automation-1")).toEqual({
      deliveredCount: 1,
      failedCount: -1,
    })
  })

  test("the first step landing costs no failure to unwind", async () => {
    commentAutomationStatsRepository.markDelivered.mockResolvedValue([
      { automationId: "automation-1", clearedFailure: false },
    ])

    await service.markDelivered({
      automationId: "automation-1",
      commentId: "comment-1",
      replyChannel: "private",
    })

    expect(countersFor("automation-1")).toEqual({ deliveredCount: 1 })
  })

  test("every step failing counts exactly one failure, not three", async () => {
    commentAutomationStatsRepository.settleEvent
      .mockResolvedValueOnce([{ automationId: "automation-1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const settleFailure = (detail: string) =>
      service.settleEvent({
        automationId: "automation-1",
        commentId: "comment-1",
        replyChannel: "private",
        status: "failed",
        errorDetail: detail,
      })

    await settleFailure("step 1 threw")
    expect(countersFor("automation-1")).toEqual({ failedCount: 1 })

    await settleFailure("step 2 threw")
    expect(countersFor("automation-1")).toBeUndefined()

    await settleFailure("step 3 threw")
    expect(countersFor("automation-1")).toBeUndefined()
  })
})
