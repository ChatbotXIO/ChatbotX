import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// automation-throttle repository — atomic claim/release/purge against the
// AutomationThrottle table. Mocks `db` at the module boundary (query builder
// chain) and asserts the CAS/`onConflictDoUpdate` shape without touching a
// real database.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  lt: vi.fn((column: unknown, value: unknown) => ({ lt: [column, value] })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: [strings, values],
  })),
  insert: vi.fn(),
  select: vi.fn(),
  delete: vi.fn(),
  execute: vi.fn(),
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  db: {
    insert: mocks.insert,
    select: mocks.select,
    delete: mocks.delete,
    execute: mocks.execute,
  },
  eq: mocks.eq,
  lt: mocks.lt,
  sql: mocks.sql,
}))

vi.mock("../src/schema", () => ({
  automationThrottleModel: {
    workspaceId: "workspaceId",
    contactInboxId: "contactInboxId",
    throttleType: "throttleType",
    subjectId: "subjectId",
    lastTriggeredAt: "lastTriggeredAt",
    claimId: "claimId",
  },
}))

const {
  claimAutomationThrottle,
  releaseAutomationThrottle,
  purgeStaleAutomationThrottles,
} = await import("../src/repositories/automation-throttle/repository")

const SUBJECT = {
  workspaceId: "ws-1",
  contactInboxId: "inbox-1",
  throttleType: "defaultReply" as const,
  subjectId: "0",
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("claimAutomationThrottle", () => {
  test("returns 'won' with the DB-computed remainingSeconds on a fresh insert / re-trigger", async () => {
    const returning = vi.fn().mockResolvedValue([{ remainingSeconds: 3600 }])
    const onConflictDoUpdate = vi.fn(() => ({ returning }))
    const values = vi.fn(() => ({ onConflictDoUpdate }))
    mocks.insert.mockReturnValue({ values })

    const result = await claimAutomationThrottle({
      ...SUBJECT,
      windowSeconds: 3600,
      claimId: "claim-1",
    })

    expect(result).toEqual({
      won: true,
      claimId: "claim-1",
      remainingSeconds: 3600,
    })
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspaceId" }),
    )
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: ["workspaceId", "contactInboxId", "throttleType", "subjectId"],
      }),
    )
    // The follow-up denied-branch SELECT must never run on a won claim.
    expect(mocks.select).not.toHaveBeenCalled()
  })

  test("windowSeconds 0 (unbounded) omits the setWhere predicate so the upsert always wins", async () => {
    const returning = vi.fn().mockResolvedValue([{ remainingSeconds: 0 }])
    const onConflictDoUpdate = vi.fn(() => ({ returning }))
    const values = vi.fn(() => ({ onConflictDoUpdate }))
    mocks.insert.mockReturnValue({ values })

    const result = await claimAutomationThrottle({
      ...SUBJECT,
      windowSeconds: 0,
      claimId: "claim-0",
    })

    // Always wins + records; no window predicate (a transaction-start `now()`
    // comparison could otherwise deny it under a concurrent conflict race).
    expect(result).toEqual({
      won: true,
      claimId: "claim-0",
      remainingSeconds: 0,
    })
    expect(onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ setWhere: undefined }),
    )
    expect(mocks.select).not.toHaveBeenCalled()
  })

  test("falls back to a required SELECT for the DB-computed remainingSeconds when the conflict setWhere denies", async () => {
    const returning = vi.fn().mockResolvedValue([])
    const onConflictDoUpdate = vi.fn(() => ({ returning }))
    const values = vi.fn(() => ({ onConflictDoUpdate }))
    mocks.insert.mockReturnValue({ values })

    const where = vi.fn().mockResolvedValue([{ remainingSeconds: 1800 }])
    const from = vi.fn(() => ({ where }))
    mocks.select.mockReturnValue({ from })

    const result = await claimAutomationThrottle({
      ...SUBJECT,
      windowSeconds: 3600,
      claimId: "claim-2",
    })

    expect(result).toEqual({ won: false, remainingSeconds: 1800 })
    expect(mocks.select).toHaveBeenCalled()
  })

  test("returns remainingSeconds:0 (no-cache) when the denied-branch SELECT finds no row (raced with a concurrent release)", async () => {
    const returning = vi.fn().mockResolvedValue([])
    const onConflictDoUpdate = vi.fn(() => ({ returning }))
    const values = vi.fn(() => ({ onConflictDoUpdate }))
    mocks.insert.mockReturnValue({ values })

    const where = vi.fn().mockResolvedValue([])
    const from = vi.fn(() => ({ where }))
    mocks.select.mockReturnValue({ from })

    const result = await claimAutomationThrottle({
      ...SUBJECT,
      windowSeconds: 3600,
      claimId: "claim-3",
    })

    // 0 => the service skips the Redis marker (no stale-denial cache), and the
    // next message re-consults Postgres (which will allow it).
    expect(result).toEqual({ won: false, remainingSeconds: 0 })
  })

  test("scopes the conflict target and setWhere to workspaceId+contactInboxId+throttleType+subjectId (type/subject isolation)", async () => {
    const returning = vi.fn().mockResolvedValue([{ remainingSeconds: 60 }])
    const onConflictDoUpdate = vi.fn(() => ({ returning }))
    const values = vi.fn(() => ({ onConflictDoUpdate }))
    mocks.insert.mockReturnValue({ values })

    await claimAutomationThrottle({
      ...SUBJECT,
      subjectId: "flow-42",
      windowSeconds: 60,
      claimId: "claim-4",
    })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: "flow-42" }),
    )
  })
})

describe("releaseAutomationThrottle", () => {
  test("deletes by claimId (CAS) scoped to the full subject and returns true when a row was removed", async () => {
    const returning = vi.fn().mockResolvedValue([{ claimId: "claim-1" }])
    const where = vi.fn(() => ({ returning }))
    mocks.delete.mockReturnValue({ where })

    const removed = await releaseAutomationThrottle({
      ...SUBJECT,
      claimId: "claim-1",
    })

    expect(removed).toBe(true)
    expect(mocks.delete).toHaveBeenCalled()
    expect(mocks.eq).toHaveBeenCalledWith("claimId", "claim-1")
    expect(where).toHaveBeenCalled()
  })

  test("returns false when the claimId no longer matches — a newer claim already replaced the row", async () => {
    // Unconditional DELETE ... WHERE claimId = X; if a newer claim owns the
    // row, 0 rows match, RETURNING is empty, and the CAS reports false so the
    // caller skips evicting the newer claim's Redis marker.
    const returning = vi.fn().mockResolvedValue([])
    const where = vi.fn(() => ({ returning }))
    mocks.delete.mockReturnValue({ where })

    await expect(
      releaseAutomationThrottle({ ...SUBJECT, claimId: "stale-claim" }),
    ).resolves.toBe(false)
  })
})

describe("purgeStaleAutomationThrottles", () => {
  test("bulk-deletes stale rows and returns the DB-side rowCount (no rows materialized)", async () => {
    mocks.execute.mockResolvedValue({ rowCount: 2 })

    const deleted = await purgeStaleAutomationThrottles()

    expect(deleted).toBe(2)
    expect(mocks.execute).toHaveBeenCalled()
  })

  test("returns 0 when nothing is stale", async () => {
    mocks.execute.mockResolvedValue({ rowCount: 0 })

    expect(await purgeStaleAutomationThrottles()).toBe(0)
  })
})
