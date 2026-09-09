import { beforeEach, describe, expect, test, vi } from "vitest"

/**
 * `CoexistSyncRun` is a shared table: `type = 'coexist'` (coexistence sync)
 * and `type = 'contact_scan'` (Automatic Customer Scan) rows live side by
 * side. The safety invariant (plan `docs/plans/2026-09-09-automatic-contact-
 * scan.md` §3(a), `docs/contact-scan.md`) is that every set-query — a query
 * that selects rows by something other than the PK `id` — MUST filter by
 * `type` for its own kind, or a misrouted job / a scan row that happens to
 * share `(integrationId, channel)` with a coexist row silently corrupts the
 * other lifecycle. This file guards that filter directly so a future edit
 * that drops it fails CI instead of surfacing as a production incident.
 *
 * Mocking style mirrors the sibling `coexist-sync-run-repository.test.ts`
 * (drizzle builder calls captured as plain objects) for the chained-builder
 * methods, and `coexist-run-recovery-repository.test.ts` (`text`/`values`
 * `sql` fragments) for `pickDueRuns`, which is raw SQL.
 */
const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({
    inArray: [column, values],
  })),
  isNull: vi.fn((column: unknown) => ({ isNull: column })),
  isUniqueViolationError: vi.fn(),
  lt: vi.fn((column: unknown, value: unknown) => ({ lt: [column, value] })),
  ne: vi.fn((column: unknown, value: unknown) => ({ ne: [column, value] })),
  or: vi.fn((...conditions: unknown[]) => ({ or: conditions })),
  // `listContactScanRuns` (relational-query list) resolves its count via
  // `relationsFilterToSQL` — a passthrough stub is enough here since the
  // scoping assertion is made on the `where` object passed to `findMany`,
  // not on the SQL this produces.
  relationsFilterToSQL: vi.fn((_table: unknown, where: unknown) => where),
  // Keep the raw template so `pickDueRuns` can be checked against the
  // generated SQL text / bound parameters, same as the recovery-query tests.
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      text: Array.from(strings).join("?"),
      values,
    })),
    {
      join: (parts: unknown[], separator: unknown) => ({
        text: "",
        values: [...parts, separator],
      }),
    },
  ),
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  db: {},
  eq: mocks.eq,
  inArray: mocks.inArray,
  isNull: mocks.isNull,
  isUniqueViolationError: mocks.isUniqueViolationError,
  lt: mocks.lt,
  ne: mocks.ne,
  or: mocks.or,
  relationsFilterToSQL: mocks.relationsFilterToSQL,
  sql: mocks.sql,
}))

vi.mock("../src/schema", () => ({
  coexistSyncRunModel: {
    id: "runId",
    status: "status",
    startedAt: "startedAt",
    lastHeartbeatAt: "lastHeartbeatAt",
    updatedAt: "updatedAt",
    attempts: "attempts",
    integrationId: "integrationId",
    channel: "channel",
    currentScan: "currentScan",
    importedContactCount: "importedContactCount",
    importedMessageCount: "importedMessageCount",
    skippedCount: "skippedCount",
    failedCount: "failedCount",
    claimToken: "claimToken",
    type: "type",
    scanFromAt: "scanFromAt",
    requestedByUserId: "requestedByUserId",
    resumeCursor: "resumeCursor",
    workspaceId: "workspaceId",
  },
  integrationInstagramModel: {
    id: "instagramId",
    workspaceId: "instagramWorkspaceId",
    type: "instagramType",
  },
  integrationMessengerModel: {
    id: "messengerId",
    workspaceId: "messengerWorkspaceId",
  },
  integrationWhatsappModel: {
    id: "whatsappId",
    workspaceId: "whatsappWorkspaceId",
  },
}))

const { CoexistSyncRunRepository } = await import(
  "../src/repositories/coexist-sync-run/repository"
)

type ExecutedQuery = { text: string; values: unknown[] }

/** Every bound parameter in the template tree, including nested fragments. */
const emittedValues = (query: unknown): unknown[] => {
  const found: unknown[] = []
  const walk = (node: unknown) => {
    if (node === null || typeof node !== "object") {
      found.push(node)
      return
    }
    const candidate = node as Partial<ExecutedQuery>
    if (typeof candidate.text !== "string") {
      return
    }
    for (const value of candidate.values ?? []) {
      walk(value)
    }
  }
  walk(query)
  return found
}

describe("CoexistSyncRun type-discriminator scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isUniqueViolationError.mockReturnValue(false)
  })

  // --- Literal-scoped coexist set-queries ---------------------------------

  test("findActiveInitRun filters type: coexist", async () => {
    const findFirst = vi.fn().mockResolvedValue(null)
    const repository = new CoexistSyncRunRepository()

    await repository.findActiveInitRun({
      integrationId: "integration-1",
      channel: "instagram",
      tx: { query: { coexistSyncRunModel: { findFirst } } } as never,
    })

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "coexist" }),
      }),
    )
  })

  test("findLiveRun filters type: coexist", async () => {
    const findFirst = vi.fn().mockResolvedValue(null)
    const repository = new CoexistSyncRunRepository()

    await repository.findLiveRun({
      integrationId: "integration-1",
      channel: "whatsapp",
      tx: { query: { coexistSyncRunModel: { findFirst } } } as never,
    })

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "coexist" }),
      }),
    )
  })

  test("findResumeCeiling filters type: coexist", async () => {
    const findFirst = vi.fn().mockResolvedValue(null)
    const repository = new CoexistSyncRunRepository()

    await repository.findResumeCeiling({
      integrationId: "integration-1",
      channel: "messenger",
      currentRunId: "run-1",
      tx: { query: { coexistSyncRunModel: { findFirst } } } as never,
    })

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "coexist" }),
      }),
    )
  })

  test("tearDownActiveRunsForIntegration filters type: coexist", async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn(() => ({ where }))
    const update = vi.fn(() => ({ set }))
    const repository = new CoexistSyncRunRepository()

    await repository.tearDownActiveRunsForIntegration({
      channel: "whatsapp",
      integrationId: "integration-1",
      currentError: "Coexist disabled",
      tx: { update } as never,
    })

    // Without this, disabling coexist would also tear down a live
    // contact-scan run sharing the same (integrationId, channel).
    expect(where).toHaveBeenCalledWith(
      expect.objectContaining({
        and: expect.arrayContaining([{ eq: ["type", "coexist"] }]),
      }),
    )
  })

  // --- Param-scoped coexist set-queries: caller's `type` must be forwarded --

  test("markMaxAttemptsFailed applies the caller's type filter", async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn(() => ({ where }))
    const update = vi.fn(() => ({ set }))
    const repository = new CoexistSyncRunRepository()

    await repository.markMaxAttemptsFailed({
      type: "coexist",
      maxAttempts: 5,
      tx: { update } as never,
    })

    expect(mocks.eq).toHaveBeenCalledWith("type", "coexist")
    expect(where).toHaveBeenCalledWith(
      expect.objectContaining({
        and: expect.arrayContaining([{ eq: ["type", "coexist"] }]),
      }),
    )
  })

  test("pickDueRuns binds the caller's type as a SQL parameter", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] })
    const repository = new CoexistSyncRunRepository()

    await repository.pickDueRuns({
      type: "coexist",
      batchSize: 10,
      maxAttempts: 5,
      tx: { execute } as never,
    })

    const bound = emittedValues(execute.mock.calls[0]?.[0])
    expect(bound).toContain("coexist")
  })

  // --- WhatsApp "belt" recovery selectors: raw SQL, type scoped -----------
  // All three emit `r.type = 'coexist'` as an inline SQL literal (unlike
  // `pickDueRuns`'s `type`, which is a bound parameter), so the filter is
  // only observable in the generated SQL text, not in `emittedValues`.

  test("reviveWaitingRunsWithPendingStaging scopes type: coexist inline in the SQL text", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] })
    const repository = new CoexistSyncRunRepository()

    await repository.reviveWaitingRunsWithPendingStaging({
      batchSize: 10,
      tx: { execute } as never,
    })

    const query = execute.mock.calls[0]?.[0] as ExecutedQuery
    expect(query.text).toContain("r.type = 'coexist'")
  })

  test("finalizeTimedOutWaitingRuns scopes type: coexist inline in the SQL text", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] })
    const repository = new CoexistSyncRunRepository()

    await repository.finalizeTimedOutWaitingRuns({
      windowMs: 60_000,
      currentError: "history_timeout",
      batchSize: 10,
      tx: { execute } as never,
    })

    const query = execute.mock.calls[0]?.[0] as ExecutedQuery
    expect(query.text).toContain("r.type = 'coexist'")
  })

  test("findStrandedCoexistWhatsappIntegrations scopes type: coexist inline in the SQL text", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] })
    const repository = new CoexistSyncRunRepository()

    await repository.findStrandedCoexistWhatsappIntegrations({
      limit: 10,
      tx: { execute } as never,
    })

    const query = execute.mock.calls[0]?.[0] as ExecutedQuery
    expect(query.text).toContain("r.type = 'coexist'")
  })

  // --- Contact-scan set-queries: `type = 'contact_scan'` -------------------

  test("createContactScanRun inserts type: contact_scan", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "scan-1" }])
    const onConflictDoNothing = vi.fn(() => ({ returning }))
    const values = vi.fn(() => ({ onConflictDoNothing }))
    const insert = vi.fn(() => ({ values }))
    const repository = new CoexistSyncRunRepository()

    await repository.createContactScanRun({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      channel: "whatsapp",
      requestedByUserId: "user-1",
      scanFromAt: new Date("2026-01-01T00:00:00Z"),
      triggerSource: "manual",
      tx: { insert } as never,
    })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ type: "contact_scan" }),
    )
  })

  test("findLatestContactScanRun filters type: contact_scan", async () => {
    const findFirst = vi.fn().mockResolvedValue(null)
    const repository = new CoexistSyncRunRepository()

    await repository.findLatestContactScanRun({
      workspaceId: "workspace-1",
      integrationId: "integration-1",
      tx: { query: { coexistSyncRunModel: { findFirst } } } as never,
    })

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "contact_scan" }),
      }),
    )
  })

  test("claimContactScanRun filters type: contact_scan in its update WHERE", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "scan-1" }])
    const where = vi.fn(() => ({ returning }))
    const set = vi.fn(() => ({ where }))
    const update = vi.fn(() => ({ set }))
    const repository = new CoexistSyncRunRepository()

    await repository.claimContactScanRun({
      runId: "scan-1",
      tx: { update } as never,
    })

    // Without this, a misrouted claim could pick up a live coexist run
    // sharing the same id space.
    expect(where).toHaveBeenCalledWith(
      expect.objectContaining({
        and: expect.arrayContaining([{ eq: ["type", "contact_scan"] }]),
      }),
    )
  })

  test("yieldForContinuation releases the token, keeps running, and is type + claim fenced", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "scan-1" }])
    const where = vi.fn(() => ({ returning }))
    const set = vi.fn(() => ({ where }))
    const update = vi.fn(() => ({ set }))
    const repository = new CoexistSyncRunRepository()

    await repository.yieldForContinuation({
      runId: "scan-1",
      expect: { status: "running", claimToken: "tok-1" },
      tx: { update } as never,
    })

    // Releases the lease token but must NOT terminate the run — it stays
    // `running` so only the hot-chained continuation (never the sweeper) drives
    // it, so the SET carries no `status`.
    const setArg = set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg).toMatchObject({ claimToken: null })
    expect(setArg).not.toHaveProperty("status")

    // Fenced: type-scoped AND guarded by the caller's claim (id + status +
    // claimToken from runWriteFilter), so a taken-over worker writes 0 rows.
    expect(where).toHaveBeenCalledWith(
      expect.objectContaining({
        and: expect.arrayContaining([
          { eq: ["type", "contact_scan"] },
          { eq: ["runId", "scan-1"] },
          { eq: ["status", "running"] },
          { eq: ["claimToken", "tok-1"] },
        ]),
      }),
    )
  })

  test("reopenReleased only reopens a released (running + null-token) contact_scan run", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "scan-1" }])
    const where = vi.fn(() => ({ returning }))
    const set = vi.fn(() => ({ where }))
    const update = vi.fn(() => ({ set }))
    const repository = new CoexistSyncRunRepository()

    await repository.reopenReleased({
      runId: "scan-1",
      tx: { update } as never,
    })

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "init" }),
    )
    // Must match ONLY a row the engine released (running + claimToken IS NULL):
    // a row re-claimed in the meantime has a token and stays untouched. Also
    // type-scoped so it can never reopen a coexist run.
    expect(where).toHaveBeenCalledWith(
      expect.objectContaining({
        and: expect.arrayContaining([
          { eq: ["runId", "scan-1"] },
          { eq: ["type", "contact_scan"] },
          { eq: ["status", "running"] },
          { isNull: "claimToken" },
        ]),
      }),
    )
  })

  test("listContactScanRuns filters type: contact_scan and stays workspace-scoped", async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const $count = vi.fn().mockResolvedValue(0)
    const repository = new CoexistSyncRunRepository()

    const result = await repository.listContactScanRuns({
      workspaceId: "workspace-1",
      page: 2,
      perPage: 10,
      tx: {
        query: { coexistSyncRunModel: { findMany } },
        $count,
      } as never,
    })

    // Without this, the Automatic Customer Scan history page could list a
    // coexist history row, or another workspace's scan runs.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "workspace-1", type: "contact_scan" },
      }),
    )
    expect($count).toHaveBeenCalledWith(expect.anything(), {
      workspaceId: "workspace-1",
      type: "contact_scan",
    })
    expect(result).toEqual({ data: [], pageCount: 0 })
  })

  test("listContactScanRuns paginates and defaults to createdAt desc", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "scan-1" }])
    const $count = vi.fn().mockResolvedValue(25)
    const repository = new CoexistSyncRunRepository()

    const result = await repository.listContactScanRuns({
      workspaceId: "workspace-1",
      page: 2,
      perPage: 10,
      tx: {
        query: { coexistSyncRunModel: { findMany } },
        $count,
      } as never,
    })

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
        limit: 10,
        offset: 10,
      }),
    )
    expect(result).toEqual({ data: [{ id: "scan-1" }], pageCount: 3 })
  })
})
