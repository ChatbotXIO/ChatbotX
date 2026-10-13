import type { RecurrenceRule } from "@chatbotx.io/utils/recurrence"
import { beforeEach, describe, expect, test, vi } from "vitest"

const repo = vi.hoisted(() => ({
  insertLedgerRows: vi.fn(),
  update: vi.fn(),
  selectDbNow: vi.fn(),
  lockAllForWorkspace: vi.fn(),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  broadcastRecurrenceRepository: repo,
}))

const { accountSlots, disarmSeries, disarmAllSeriesForWorkspace } =
  await import("../src/broadcast/recurrence-ledger")

const tx = {} as never
const rule: RecurrenceRule = {
  frequency: "daily",
  interval: 1,
  timeOfDay: "09:00",
  timezone: "UTC",
  startsOn: "2020-01-01",
  end: { kind: "never" },
}
const at = (value: string) => new Date(value)
const recurrence = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "r1",
    workspaceId: "w1",
    broadcastId: "t1",
    rule,
    nextRunAt: at("2026-10-14T09:00:00Z"),
    accountedThroughAt: at("2026-10-10T09:00:00Z"),
    occurrenceCount: 0,
    ...overrides,
  }) as never
const rowsWritten = () =>
  repo.insertLedgerRows.mock.calls.flatMap(
    (call) => call[1] as Record<string, unknown>[],
  )

beforeEach(() => {
  vi.clearAllMocks()
  repo.update.mockResolvedValue(true)
})

describe("accountSlots", () => {
  test("writes one row per elapsed slot", async () => {
    await accountSlots(tx, {
      recurrence: recurrence(),
      through: at("2026-10-13T12:00:00Z"),
      outcome: "skipped",
      reason: "paused",
      now: at("2026-10-13T12:00:00Z"),
    })
    expect(rowsWritten().map((row) => row.localSlot)).toEqual([
      "2026-10-11 09:00",
      "2026-10-12 09:00",
      "2026-10-13 09:00",
    ])
    expect(rowsWritten()[0]).toMatchObject({
      workspaceId: "w1",
      recurrenceId: "r1",
      outcome: "skipped",
      reason: "paused",
      childBroadcastId: null,
      supersededCount: 1,
    })
  })

  test("never accounts a series that was never armed or has nothing elapsed", async () => {
    await accountSlots(tx, {
      recurrence: recurrence({ accountedThroughAt: null }),
      through: at("2026-10-13T12:00:00Z"),
      outcome: "missed",
      reason: "catchUpSuperseded",
      now: at("2026-10-13T12:00:00Z"),
    })
    await accountSlots(tx, {
      recurrence: recurrence({
        accountedThroughAt: at("2026-10-13T12:00:00Z"),
      }),
      through: at("2026-10-13T12:00:00Z"),
      outcome: "missed",
      reason: "catchUpSuperseded",
      now: at("2026-10-13T12:00:00Z"),
    })
    expect(repo.insertLedgerRows).not.toHaveBeenCalled()
  })

  test("a backlog beyond the cap collapses its oldest slots into one summary row", async () => {
    await accountSlots(tx, {
      recurrence: recurrence({
        accountedThroughAt: at("2020-01-01T09:00:00Z"),
      }),
      through: at("2022-01-01T09:00:00Z"), // ~731 daily slots
      outcome: "missed",
      reason: "catchUpSuperseded",
      now: at("2022-01-01T09:00:00Z"),
    })
    const rows = rowsWritten()
    expect(rows).toHaveLength(500)
    expect(rows[0].supersededCount).toBeGreaterThan(1)
    expect(rows.slice(1).every((row) => row.supersededCount === 1)).toBe(true)
    // Every slot stays accounted for: the summary stands for the rest.
    const total = rows.reduce(
      (sum, row) => sum + (row.supersededCount as number),
      0,
    )
    expect(total).toBe(731)
    // The summary keeps the OLDEST slot's identity.
    expect(rows[0].localSlot).toBe("2020-01-02 09:00")
  })
})

describe("disarmSeries", () => {
  const now = at("2026-10-12T20:00:00Z")

  test.each([
    [
      "paused",
      { nextRunAt: null, pausedAt: now, accountedThroughAt: now },
      "paused",
    ],
    [
      "draft",
      { nextRunAt: null, pausedAt: null, accountedThroughAt: now },
      "draft",
    ],
  ] as const)("%s stops the series and accounts the slots already due", async (reason, patch, ledgerReason) => {
    await disarmSeries(tx, { recurrence: recurrence(), reason, now })
    expect(rowsWritten().length).toBeGreaterThan(0)
    expect(rowsWritten().every((row) => row.reason === ledgerReason)).toBe(true)
    expect(repo.update).toHaveBeenCalledWith(tx, { id: "r1", patch })
  })

  test("deleting stops without writing ledger rows", async () => {
    await disarmSeries(tx, { recurrence: recurrence(), reason: "deleted", now })
    expect(repo.insertLedgerRows).not.toHaveBeenCalled()
    expect(repo.update).toHaveBeenCalledWith(tx, {
      id: "r1",
      patch: { nextRunAt: null },
    })
  })

  test("an already-stopped series is not accounted again", async () => {
    await disarmSeries(tx, {
      recurrence: recurrence({ nextRunAt: null }),
      reason: "paused",
      now,
    })
    expect(repo.insertLedgerRows).not.toHaveBeenCalled()
    expect(repo.update).toHaveBeenCalledWith(tx, {
      id: "r1",
      patch: { nextRunAt: null, pausedAt: now },
    })
  })

  test("editing a paused series ends the pause: the pause's slots stay 'paused', the edit's become 'draft' later", async () => {
    await disarmSeries(tx, {
      recurrence: recurrence({
        nextRunAt: null,
        pausedAt: at("2026-10-10T09:00:00Z"),
        accountedThroughAt: at("2026-10-10T09:00:00Z"),
      }),
      reason: "draft",
      now,
    })
    expect(rowsWritten().length).toBeGreaterThan(0)
    expect(rowsWritten().every((row) => row.reason === "paused")).toBe(true)
    expect(repo.update).toHaveBeenCalledWith(tx, {
      id: "r1",
      patch: { nextRunAt: null, pausedAt: null, accountedThroughAt: now },
    })
  })
})

describe("disarmAllSeriesForWorkspace", () => {
  test("locks every series, then stops only the armed ones", async () => {
    repo.selectDbNow.mockResolvedValue(at("2026-10-12T20:00:00Z"))
    repo.lockAllForWorkspace.mockResolvedValue([
      recurrence({ id: "r1" }),
      recurrence({ id: "r2", nextRunAt: null }),
      recurrence({ id: "r3" }),
    ])

    const stopped = await disarmAllSeriesForWorkspace(tx, { workspaceId: "w1" })

    expect(stopped).toBe(2)
    expect(repo.lockAllForWorkspace).toHaveBeenCalledWith(tx, {
      workspaceId: "w1",
    })
    expect(repo.update.mock.calls.map((call) => call[1].id)).toEqual([
      "r1",
      "r3",
    ])
  })
})
