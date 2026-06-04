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

const refLinkStatModel = { workspaceId: "ws_col", linkId: "link_col" }

vi.mock("@chatbotx.io/database/schema", () => ({ refLinkStatModel }))

// ── repository mock ───────────────────────────────────────────────────────────

const refLinkStatsRepository = {
  getStatsByDateRange: vi.fn(),
  getContactStats: vi.fn(),
  getContactCount: vi.fn(),
}

vi.mock("../src/repositories/postgres/ref-link-stats.repository", () => ({
  refLinkStatsRepository,
}))

// ── listLinkContactStats mock ─────────────────────────────────────────────────

const listLinkContactStats = vi.fn()

vi.mock("../src/services/link-contact-stats", () => ({ listLinkContactStats }))

// ── subject ───────────────────────────────────────────────────────────────────

const { RefLinkAnalyticsService } = await import(
  "../src/services/ref-link-analytics.service"
)

// ── helpers ───────────────────────────────────────────────────────────────────

function makePayload(
  overrides: {
    refId?: string | null
    workspaceId?: string
    contactId?: string
    contactInboxId?: string
  } = {},
) {
  const refId =
    overrides.refId === undefined ? "ref-1" : (overrides.refId ?? undefined)
  return {
    context: {
      workspaceId: overrides.workspaceId ?? "ws-1",
      contactId: overrides.contactId ?? "c-1",
      contactInboxId: overrides.contactInboxId ?? "ci-1",
    },
    action: {
      ...(refId === undefined ? {} : { refId }),
      refType: "entryPoint" as const,
    },
    occurredAt: new Date("2026-06-01T10:00:00.000Z"),
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  capturedInsertValues.length = 0
  vi.clearAllMocks()
})

describe("RefLinkAnalyticsService — handler filtering", () => {
  test("inserts one record for a valid reflink payload", async () => {
    const svc = new RefLinkAnalyticsService()
    await svc.handler([makePayload()])

    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(capturedInsertValues).toHaveLength(1)

    const row = capturedInsertValues[0] as Record<string, unknown>
    expect(row.workspaceId).toBe("ws-1")
    expect(row.linkId).toBe("ref-1")
    expect(row.contactId).toBe("c-1")
    expect(row.contactInboxId).toBe("ci-1")
  })

  test("skips payloads without a refId", async () => {
    const svc = new RefLinkAnalyticsService()
    await svc.handler([makePayload({ refId: null })])

    expect(db.insert).not.toHaveBeenCalled()
  })

  test("only inserts the valid payloads from a mixed batch", async () => {
    const svc = new RefLinkAnalyticsService()
    await svc.handler([
      makePayload({ refId: null }),
      makePayload({ refId: "ref-valid", contactInboxId: "ci-2" }),
    ])

    expect(capturedInsertValues).toHaveLength(1)
    const row = capturedInsertValues[0] as Record<string, unknown>
    expect(row.linkId).toBe("ref-valid")
    expect(row.contactInboxId).toBe("ci-2")
  })

  test("inserts multiple valid payloads in one batch", async () => {
    const svc = new RefLinkAnalyticsService()
    await svc.handler([
      makePayload({ refId: "ref-a", contactInboxId: "ci-a" }),
      makePayload({ refId: "ref-b", contactInboxId: "ci-b" }),
    ])

    expect(capturedInsertValues).toHaveLength(2)
  })

  test("is a no-op for an empty payload list", async () => {
    const svc = new RefLinkAnalyticsService()
    await svc.handler([])

    expect(db.insert).not.toHaveBeenCalled()
  })
})

describe("RefLinkAnalyticsService — getRefLinkStatsByDateRange", () => {
  test("delegates to the repository with the correct params", async () => {
    refLinkStatsRepository.getStatsByDateRange.mockResolvedValueOnce([])
    const svc = new RefLinkAnalyticsService()

    await svc.getRefLinkStatsByDateRange({
      workspaceId: "ws-1",
      linkId: "ref-1",
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: "2026-06-07T23:59:59.999Z",
      timezone: "Asia/Ho_Chi_Minh",
    })

    expect(refLinkStatsRepository.getStatsByDateRange).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      linkId: "ref-1",
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: "2026-06-07T23:59:59.999Z",
      timezone: "Asia/Ho_Chi_Minh",
    })
  })

  test("sorts rows by dateReport ascending", async () => {
    refLinkStatsRepository.getStatsByDateRange.mockResolvedValueOnce([
      { dateReport: "2026-06-03", count: 5 },
      { dateReport: "2026-06-01", count: 1 },
      { dateReport: "2026-06-02", count: 3 },
    ])
    const svc = new RefLinkAnalyticsService()

    const rows = await svc.getRefLinkStatsByDateRange({
      workspaceId: "ws-1",
      linkId: "ref-1",
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
    refLinkStatsRepository.getStatsByDateRange.mockResolvedValueOnce([])
    const svc = new RefLinkAnalyticsService()

    const rows = await svc.getRefLinkStatsByDateRange({
      workspaceId: "ws-1",
      linkId: "ref-1",
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: "2026-06-07T23:59:59.999Z",
      timezone: "UTC",
    })

    expect(rows).toEqual([])
  })

  test("preserves already-sorted rows unchanged", async () => {
    const sorted = [
      { dateReport: "2026-06-01", count: 1 },
      { dateReport: "2026-06-02", count: 2 },
    ]
    refLinkStatsRepository.getStatsByDateRange.mockResolvedValueOnce([
      ...sorted,
    ])
    const svc = new RefLinkAnalyticsService()

    const rows = await svc.getRefLinkStatsByDateRange({
      workspaceId: "ws-1",
      linkId: "ref-1",
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: "2026-06-02T23:59:59.999Z",
      timezone: "UTC",
    })

    expect(rows).toEqual(sorted)
  })
})

describe("RefLinkAnalyticsService — getRefLinkContactStats", () => {
  test("delegates to listLinkContactStats with the input params", async () => {
    listLinkContactStats.mockResolvedValueOnce({
      data: [],
      total: 0,
      page: 1,
      pageCount: 0,
    })

    const svc = new RefLinkAnalyticsService()
    const input = {
      workspaceId: "ws-1",
      linkId: "ref-1",
      page: 1,
      perPage: 10,
    }

    await svc.getRefLinkContactStats(input)

    expect(listLinkContactStats).toHaveBeenCalledWith(
      expect.objectContaining({ params: input }),
    )
  })
})
