import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findOrFail: vi.fn(),
  findManyByIds: vi.fn(),
  listModerationLogs: vi.fn(),
  getModerationSummary: vi.fn(),
}))

vi.mock("@chatbotx.io/analytics", () => ({
  commentAutomationAnalyticsService: {
    listModerationLogs: mocks.listModerationLogs,
    getModerationSummary: mocks.getModerationSummary,
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  commentAutomationService: { findOrFail: mocks.findOrFail },
  contactInboxService: { findManyByIds: mocks.findManyByIds },
}))

const { getModerationSummary, listModerationLogs } = await import(
  "@/features/shared/comment-automation/lib/moderation-logs"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findOrFail.mockResolvedValue({ id: "9" })
})

describe("listModerationLogs", () => {
  test("404s an automation outside the workspace before reading the log", async () => {
    mocks.findOrFail.mockRejectedValue(new Error("not found"))

    await expect(
      listModerationLogs("workspace-1", { id: "9", page: 1, perPage: 50 }),
    ).rejects.toThrow("not found")
    expect(mocks.listModerationLogs).not.toHaveBeenCalled()
  })

  test("passes the filter through and hydrates the commenter", async () => {
    mocks.listModerationLogs.mockResolvedValue({
      rows: [
        {
          id: "log-1",
          commentId: "c-1",
          postId: "p-1",
          commentText: "trash",
          source: "ai",
          rule: null,
          matchedKeyword: null,
          categories: ["offensive"],
          reason: "Insult",
          action: "hide",
          status: "done",
          errorDetail: null,
          occurredAt: new Date("2026-11-02T00:00:00Z"),
          contactId: "contact-1",
          contactInboxId: "ci-1",
        },
      ],
      total: 51,
    })
    mocks.findManyByIds.mockResolvedValue([
      {
        id: "ci-1",
        contactId: "contact-1",
        sourceId: "user-1",
        channel: "instagram",
        conversation: { id: "conversation-1" },
        contact: { fullName: "Jane", avatar: null },
      },
    ])

    const result = await listModerationLogs("workspace-1", {
      id: "9",
      page: 1,
      perPage: 50,
      from: "2026-11-01T00:00:00+07:00",
      action: "hide",
    })

    expect(mocks.listModerationLogs).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      automationId: "9",
      from: new Date("2026-11-01T00:00:00+07:00"),
      to: undefined,
      action: "hide",
      source: undefined,
      page: 1,
      perPage: 50,
    })
    expect(result.pageCount).toBe(2)
    expect(result.data[0]).toMatchObject({
      reason: "Insult",
      occurredAt: "2026-11-02T00:00:00.000Z",
      conversationId: "conversation-1",
      channel: "instagram",
      fullName: "Jane",
    })
  })
})

describe("getModerationSummary", () => {
  test("folds source × action × status rows into totals", async () => {
    mocks.getModerationSummary.mockResolvedValue([
      { source: "rule", action: "hide", status: "done", total: 3 },
      { source: "ai", action: "delete", status: "done", total: 2 },
      { source: "ai", action: "hide", status: "failed", total: 1 },
      { source: "ai", action: "hide", status: "pending", total: 1 },
    ])

    expect(await getModerationSummary("workspace-1", { id: "9" })).toEqual({
      total: 7,
      hidden: 5,
      deleted: 2,
      byRule: 3,
      byAI: 4,
      failed: 1,
      pending: 1,
    })
  })
})
