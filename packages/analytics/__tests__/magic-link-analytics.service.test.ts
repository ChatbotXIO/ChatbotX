import { beforeEach, describe, expect, test, vi } from "vitest"

// ── db mock ──────────────────────────────────────────────────────────────────

const capturedInsertValues: unknown[] = []

const builder: Record<string, unknown> = {}
builder.values = vi.fn((payload: unknown) => {
  if (Array.isArray(payload)) {
    capturedInsertValues.push(...payload)
  } else {
    capturedInsertValues.push(payload)
  }
  return builder
})
builder.onConflictDoNothing = vi.fn(() => builder)

const db = {
  insert: vi.fn(() => builder),
}

vi.mock("@chatbotx.io/database/client", () => ({ db }))

// ── schema mock ───────────────────────────────────────────────────────────────

const magicLinkStatModel = { workspaceId: "ws_col", linkId: "link_col" }

vi.mock("@chatbotx.io/database/schema", () => ({ magicLinkStatModel }))

// ── repository mock ───────────────────────────────────────────────────────────

const magicLinkStatsRepository = {
  getStatsByDateRange: vi.fn(),
  getContactStats: vi.fn(),
  getContactCount: vi.fn(),
}

vi.mock("../src/repositories/postgres/magic-link-stats.repository", () => ({
  magicLinkStatsRepository,
}))

// ── listLinkContactStats mock ─────────────────────────────────────────────────

const listLinkContactStats = vi.fn()

vi.mock("../src/services/link-contact-stats", () => ({ listLinkContactStats }))

// ── subject ───────────────────────────────────────────────────────────────────

const { MagicLinkAnalyticsService } = await import(
  "../src/services/magic-link-analytics.service"
)

// ── helpers ───────────────────────────────────────────────────────────────────

function makePayload(
  overrides: {
    magicLinkId?: string | null
    clickType?: string
    workspaceId?: string
    contactId?: string
    contactInboxId?: string
  } = {},
) {
  // null means "omit magicLinkId from action" to test the absent-field filter
  const hasMagicLinkId =
    !("magicLinkId" in overrides) || overrides.magicLinkId != null
  return {
    context: {
      workspaceId: overrides.workspaceId ?? "ws-1",
      contactId: overrides.contactId ?? "c-1",
      contactInboxId: overrides.contactInboxId ?? "ci-1",
    },
    action: {
      flowId: "flow-1",
      clickType: overrides.clickType ?? "magic_link",
      ...(hasMagicLinkId
        ? { magicLinkId: overrides.magicLinkId ?? "ml-1" }
        : {}),
    },
    occurredAt: new Date("2026-06-01T10:00:00.000Z"),
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  capturedInsertValues.length = 0
  vi.clearAllMocks()
})

describe("MagicLinkAnalyticsService — onClicked filtering", () => {
  test("inserts one record for a valid magic_link payload", async () => {
    const svc = new MagicLinkAnalyticsService()
    await svc.onClicked([makePayload()])

    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(capturedInsertValues).toHaveLength(1)

    const row = capturedInsertValues[0] as Record<string, unknown>
    expect(row.workspaceId).toBe("ws-1")
    expect(row.linkId).toBe("ml-1")
    expect(row.contactId).toBe("c-1")
    expect(row.contactInboxId).toBe("ci-1")
  })

  test("skips payloads without a magicLinkId", async () => {
    const svc = new MagicLinkAnalyticsService()
    await svc.onClicked([makePayload({ magicLinkId: null })])

    expect(db.insert).not.toHaveBeenCalled()
  })

  test("skips payloads with a non-magic_link clickType", async () => {
    const svc = new MagicLinkAnalyticsService()
    await svc.onClicked([
      makePayload({ clickType: "button" }),
      makePayload({ clickType: "quick_reply" }),
    ])

    expect(db.insert).not.toHaveBeenCalled()
  })

  test("only inserts the valid payloads from a mixed batch", async () => {
    const svc = new MagicLinkAnalyticsService()
    await svc.onClicked([
      makePayload({ clickType: "button" }),
      makePayload({ magicLinkId: "ml-valid", contactInboxId: "ci-2" }),
      makePayload({ magicLinkId: null }),
    ])

    expect(capturedInsertValues).toHaveLength(1)
    const row = capturedInsertValues[0] as Record<string, unknown>
    expect(row.linkId).toBe("ml-valid")
    expect(row.contactInboxId).toBe("ci-2")
  })

  test("inserts multiple valid payloads in one batch", async () => {
    const svc = new MagicLinkAnalyticsService()
    await svc.onClicked([
      makePayload({ magicLinkId: "ml-a", contactInboxId: "ci-a" }),
      makePayload({ magicLinkId: "ml-b", contactInboxId: "ci-b" }),
    ])

    expect(capturedInsertValues).toHaveLength(2)
  })

  test("is a no-op for an empty payload list", async () => {
    const svc = new MagicLinkAnalyticsService()
    await svc.onClicked([])

    expect(db.insert).not.toHaveBeenCalled()
  })
})

describe("MagicLinkAnalyticsService — getMagicLinkStatsByDateRange", () => {
  test("delegates to the repository with the correct params", async () => {
    magicLinkStatsRepository.getStatsByDateRange.mockResolvedValueOnce([])
    const svc = new MagicLinkAnalyticsService()

    await svc.getMagicLinkStatsByDateRange({
      workspaceId: "ws-1",
      linkId: "ml-1",
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: "2026-06-07T23:59:59.999Z",
      timezone: "Asia/Ho_Chi_Minh",
    })

    expect(magicLinkStatsRepository.getStatsByDateRange).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      linkId: "ml-1",
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: "2026-06-07T23:59:59.999Z",
      timezone: "Asia/Ho_Chi_Minh",
    })
  })

  test("sorts rows by dateReport ascending", async () => {
    magicLinkStatsRepository.getStatsByDateRange.mockResolvedValueOnce([
      { dateReport: "2026-06-03", count: 3 },
      { dateReport: "2026-06-01", count: 1 },
      { dateReport: "2026-06-02", count: 2 },
    ])
    const svc = new MagicLinkAnalyticsService()

    const rows = await svc.getMagicLinkStatsByDateRange({
      workspaceId: "ws-1",
      linkId: "ml-1",
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: "2026-06-03T23:59:59.999Z",
      timezone: "UTC",
    })

    expect(rows.map((r) => r.dateReport)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
    ])
  })

  test("returns an empty array when the repository returns nothing", async () => {
    magicLinkStatsRepository.getStatsByDateRange.mockResolvedValueOnce([])
    const svc = new MagicLinkAnalyticsService()

    const rows = await svc.getMagicLinkStatsByDateRange({
      workspaceId: "ws-1",
      linkId: "ml-1",
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: "2026-06-07T23:59:59.999Z",
      timezone: "UTC",
    })

    expect(rows).toEqual([])
  })
})

describe("MagicLinkAnalyticsService — getMagicLinkContactStats", () => {
  test("delegates to listLinkContactStats with the input params", async () => {
    listLinkContactStats.mockResolvedValueOnce({
      data: [],
      total: 0,
      page: 1,
      pageCount: 0,
    })

    const svc = new MagicLinkAnalyticsService()
    const input = {
      workspaceId: "ws-1",
      linkId: "ml-1",
      page: 1,
      perPage: 10,
    }

    await svc.getMagicLinkContactStats(input)

    expect(listLinkContactStats).toHaveBeenCalledWith(
      expect.objectContaining({ params: input }),
    )
  })
})
