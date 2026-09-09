import { beforeEach, describe, expect, test, vi } from "vitest"

/**
 * Recovery queries added for the WhatsApp Coexistence history lifecycle (brief
 * `coexist-switch/brief-coexist-history-lifecycle.md`). They are raw SQL, so
 * these tests assert on the emitted SQL fragments + bound parameters rather
 * than on drizzle builder calls, in the mocked-db style of the sibling
 * `coexist-sync-run-repository.test.ts`.
 */
const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({
    inArray: [column, values],
  })),
  isUniqueViolationError: vi.fn(),
  lt: vi.fn(),
  ne: vi.fn(),
  or: vi.fn(),
  // Keep the raw template so the tests can inspect the generated SQL text.
  sql: Object.assign(
    vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
      text: Array.from(strings).join("?"),
      values,
    })),
    {
      // Flat, never a nested array: `emittedSql` walks `.values`, and an array
      // node's own `.values` is `Array.prototype.values` (a function).
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
  isUniqueViolationError: mocks.isUniqueViolationError,
  lt: mocks.lt,
  ne: mocks.ne,
  or: mocks.or,
  sql: mocks.sql,
}))

vi.mock("../src/schema", () => ({
  coexistSyncRunModel: {
    id: "runId",
    status: "status",
    claimToken: "claimToken",
  },
  integrationInstagramModel: {},
  integrationMessengerModel: {},
  integrationWhatsappModel: {},
}))

const { CoexistSyncRunRepository, LIVE_RUN_STATUSES } = await import(
  "../src/repositories/coexist-sync-run/repository"
)

type ExecutedQuery = { text: string; values: unknown[] }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const makeTx = (rows: unknown[]) => {
  const execute = vi.fn().mockResolvedValue({ rows })
  return { tx: { execute } as never, execute }
}

/** Flattens every SQL template captured by the `sql` mock into one string. */
const emittedSql = (query: unknown): string => {
  const parts: string[] = []
  const walk = (node: unknown) => {
    if (node === null || typeof node !== "object") {
      return
    }
    const candidate = node as Partial<ExecutedQuery>
    if (typeof candidate.text === "string") {
      parts.push(candidate.text)
    }
    for (const value of candidate.values ?? []) {
      walk(value)
    }
  }
  walk(query)
  return parts.join(" ")
}

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

describe("CoexistSyncRunRepository recovery queries", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("reviveWaitingRunsWithPendingStaging flips waiting → init without touching attempts", async () => {
    const { tx, execute } = makeTx([
      {
        id: "run-1",
        attempts: 2,
        channel: "whatsapp",
        integrationId: "int-1",
        workspaceId: "ws-1",
      },
    ])
    const repository = new CoexistSyncRunRepository()

    const revived = await repository.reviveWaitingRunsWithPendingStaging({
      batchSize: 50,
      tx,
    })

    expect(revived).toHaveLength(1)
    const query = emittedSql(execute.mock.calls[0]?.[0])
    expect(query).toContain("SET status = 'init'")
    // Not a retry — attempts must not be incremented by the recovery pass.
    expect(query).not.toContain("attempts = attempts + 1")
    // WhatsApp-only, waiting-only.
    expect(query).toContain("r.channel = 'whatsapp'")
    expect(query).toContain("r.status = 'waiting'")
    // Parse-failed rows must not revive a run (poison-row guard).
    expect(query).toContain('s."parseFailedAt" IS NULL')
    expect(query).toContain('s."processedAt" IS NULL')
    expect(query).toContain("FOR UPDATE SKIP LOCKED")
  })

  // A revived run's `createdAt` is minutes-to-hours old, so a
  // `createdAt`-based pick re-selected it on the very same tick and burned an
  // attempt. The grace window keys off `updatedAt`, which both `createRun` and
  // the revive set to NOW().
  test("pickDueRuns gates init rows on updatedAt, not createdAt", async () => {
    const { tx, execute } = makeTx([])
    const repository = new CoexistSyncRunRepository()

    await repository.pickDueRuns({ batchSize: 10, maxAttempts: 5, tx })

    const query = emittedSql(execute.mock.calls[0]?.[0])
    expect(query).toContain(
      `status = 'init' AND "updatedAt" < NOW() - INTERVAL '10 seconds'`,
    )
    expect(query).not.toContain(`status = 'init' AND "createdAt"`)
    // The stale-running branch is unchanged.
    expect(query).toContain(
      `status = 'running' AND "lastHeartbeatAt" < NOW() - INTERVAL '1 hour'`,
    )
    expect(query).toContain("attempts = attempts + 1")
  })

  test("reviveWaitingRunsWithPendingStaging stamps updatedAt so the same tick's pick skips it", async () => {
    const { tx, execute } = makeTx([])
    const repository = new CoexistSyncRunRepository()

    await repository.reviveWaitingRunsWithPendingStaging({
      batchSize: 10,
      tx,
    })

    expect(emittedSql(execute.mock.calls[0]?.[0])).toContain(
      '"updatedAt" = NOW()',
    )
  })

  test("finalizeTimedOutWaitingRuns closes stale waiting runs as partial with the sentinel", async () => {
    const { tx, execute } = makeTx([{ id: "run-1" }])
    const repository = new CoexistSyncRunRepository()

    await repository.finalizeTimedOutWaitingRuns({
      windowMs: 24 * 60 * 60 * 1000,
      currentError: "history_timeout",
      batchSize: 100,
      tx,
    })

    const call = execute.mock.calls[0]?.[0] as ExecutedQuery
    const query = emittedSql(call)
    expect(query).toContain("SET status = 'partial'")
    expect(query).toContain('"finishedAt" = NOW()')
    expect(query).toContain("r.status = 'waiting'")
    // Only runs with NOTHING left to drain time out.
    expect(query).toContain("NOT EXISTS")
    // Window is bound in seconds, sentinel is bound as a parameter.
    expect(call.values).toContain("history_timeout")
    expect(call.values).toContain(86_400)
  })

  test("findStrandedCoexistWhatsappIntegrations excludes integrations with a live run", async () => {
    const { tx, execute } = makeTx([{ integrationId: 11n, workspaceId: 22n }])
    const repository = new CoexistSyncRunRepository()

    const stranded = await repository.findStrandedCoexistWhatsappIntegrations({
      limit: 25,
      tx,
    })

    // bigint driver values are normalized to strings for the caller.
    expect(stranded).toEqual([{ integrationId: "11", workspaceId: "22" }])
    const query = emittedSql(execute.mock.calls[0]?.[0])
    expect(query).toContain('i."coexistEnabled" = true')
    expect(query).toContain("r.status IN (")
    // F5/M2: the live-status list is built from `LIVE_RUN_STATUSES` via
    // `sql.join`, never re-typed as literals — every element stays a bound
    // parameter, and the list cannot drift from the constant.
    const bound = emittedValues(execute.mock.calls[0]?.[0])
    expect(bound).toContain("init")
    expect(bound).toContain("running")
    expect(bound).toContain("waiting")
    expect(query).toContain("NOT EXISTS")
    expect(query).toContain('s."parseFailedAt" IS NULL')
  })

  test("createRun writes pendingPatches and claimToken explicitly (no phantom defaults)", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "run-1" }])
    const onConflictDoNothing = vi.fn(() => ({ returning }))
    const values = vi.fn(() => ({ onConflictDoNothing }))
    const insert = vi.fn(() => ({ values }))
    const repository = new CoexistSyncRunRepository()

    await repository.createRun({
      workspaceId: "ws-1",
      integrationId: "int-1",
      channel: "whatsapp",
      triggerSource: "scheduler-recovery",
      tx: { insert } as never,
    })

    // Both columns are nullable with no database default (AGENTS.md invariant
    // 11) — omitting either would be a NOT NULL violation the drift guard
    // cannot see. A fresh run is unowned until a worker claims it.
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        triggerSource: "scheduler-recovery",
        pendingPatches: null,
        claimToken: null,
      }),
    )
  })

  // A flush that already claimed a run as `running` must not be able
  // to write over a teardown that flipped it to `failed`. Every post-claim write
  // therefore carries a `status = 'running'` guard and reports the affected row
  // count so the caller can tell it lost the claim.
  describe("guarded writes and the ownership claim", () => {
    const wireUpdate = (affected: { id: string }[]) => {
      const returning = vi.fn().mockResolvedValue(affected)
      const where = vi.fn(() => ({ returning }))
      const set = vi.fn(() => ({ where }))
      const update = vi.fn(() => ({ set }))
      return { tx: { update } as never, where, set }
    }

    test("updateProgress pins status = 'running' when a guard is given", async () => {
      const { tx, where } = wireUpdate([{ id: "run-1" }])
      const repository = new CoexistSyncRunRepository()

      const affected = await repository.updateProgress({
        runId: "run-1",
        expect: { status: "running" },
        fields: { currentStep: "flushing batch 1" },
        tx,
      })

      expect(affected).toBe(1)
      expect(mocks.eq).toHaveBeenCalledWith("status", "running")
      expect(where).toHaveBeenCalledOnce()
    })

    // `status = 'running'` alone cannot tell "I still own
    // this run" from "another worker reclaimed it after my heartbeat went
    // stale" — both leave the run `running`. The ownership token is the half
    // that can, so it must be part of the predicate on every guarded write.
    test("updateProgress also pins the ownership token when the caller holds one", async () => {
      const { tx } = wireUpdate([{ id: "run-1" }])
      const repository = new CoexistSyncRunRepository()

      await repository.updateProgress({
        runId: "run-1",
        expect: { status: "running", claimToken: "token-a" },
        fields: { currentStep: "flushing batch 1" },
        tx,
      })

      expect(mocks.eq).toHaveBeenCalledWith("claimToken", "token-a")
    })

    test("a null/absent token leaves the predicate token-free", async () => {
      const { tx } = wireUpdate([{ id: "run-1" }])
      const repository = new CoexistSyncRunRepository()

      await repository.updateProgress({
        runId: "run-1",
        expect: { status: "running", claimToken: null },
        fields: { currentStep: "flushing batch 1" },
        tx,
      })

      expect(mocks.eq).not.toHaveBeenCalledWith("claimToken", null)
    })

    test("updateProgress reports 0 when the guard matches nothing", async () => {
      const { tx } = wireUpdate([])
      const repository = new CoexistSyncRunRepository()

      await expect(
        repository.updateProgress({
          runId: "run-1",
          expect: { status: "running", claimToken: "token-a" },
          fields: { status: "waiting" },
          tx,
        }),
      ).resolves.toBe(0)
    })

    test("updateProgress without a guard keeps the id-only predicate", async () => {
      const { tx } = wireUpdate([{ id: "run-1" }])
      const repository = new CoexistSyncRunRepository()

      await repository.updateProgress({
        runId: "run-1",
        fields: { currentStep: "listing conversations" },
        tx,
      })

      // Messenger/Instagram writers are unchanged: no status predicate.
      expect(mocks.eq).not.toHaveBeenCalledWith("status", "running")
      expect(mocks.eq).not.toHaveBeenCalledWith("claimToken", expect.anything())
    })

    test("markFailed forwards the guard", async () => {
      const { tx } = wireUpdate([])
      const repository = new CoexistSyncRunRepository()

      const affected = await repository.markFailed({
        runId: "run-1",
        currentError: "workspaceId mismatch",
        expect: { status: "running", claimToken: "token-a" },
        tx,
      })

      expect(affected).toBe(0)
      expect(mocks.eq).toHaveBeenCalledWith("status", "running")
      expect(mocks.eq).toHaveBeenCalledWith("claimToken", "token-a")
    })

    // F5/M3: one claim for every channel — `fromStatuses` is the only
    // difference (WhatsApp may claim a run parked in `waiting`).
    test("claimRunWithNewToken mints a fresh ownership token and returns the claimed row", async () => {
      const { tx, set } = wireUpdate([
        { id: "run-1", claimToken: "generated" } as never,
      ])
      const repository = new CoexistSyncRunRepository()

      await expect(
        repository.claimRunWithNewToken({ runId: "run-1", tx }),
      ).resolves.toEqual({ id: "run-1", claimToken: "generated" })

      const written = set.mock.calls[0]?.[0] as Record<string, unknown>
      expect(written.status).toBe("running")
      expect(written.claimToken).toMatch(UUID)
      expect(written.updatedAt).toBeInstanceOf(Date)
      // Default window is the pull channels'.
      expect(mocks.inArray).toHaveBeenCalledWith("status", ["init", "running"])
    })

    test("two claims never mint the same token", async () => {
      const repository = new CoexistSyncRunRepository()
      const tokens: unknown[] = []
      for (let i = 0; i < 2; i += 1) {
        const { tx, set } = wireUpdate([{ id: "run-1" }])
        await repository.claimRunWithNewToken({ runId: "run-1", tx })
        tokens.push(
          (set.mock.calls[0]?.[0] as Record<string, unknown>).claimToken,
        )
      }

      expect(new Set(tokens).size).toBe(2)
    })

    test("claimRunWithNewToken widens to the live statuses when asked (WhatsApp)", async () => {
      const { tx } = wireUpdate([{ id: "run-1" }])
      const repository = new CoexistSyncRunRepository()

      await repository.claimRunWithNewToken({
        runId: "run-1",
        fromStatuses: LIVE_RUN_STATUSES,
        tx,
      })

      expect(mocks.inArray).toHaveBeenCalledWith("status", [
        "init",
        "running",
        "waiting",
      ])
    })

    test("claimRunWithNewToken returns null when another worker holds the run", async () => {
      const { tx } = wireUpdate([])
      const repository = new CoexistSyncRunRepository()

      await expect(
        repository.claimRunWithNewToken({ runId: "run-1", tx }),
      ).resolves.toBeNull()
    })
  })

  test("tearDownActiveRunsForIntegration also tears down waiting runs", async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn(() => ({ where }))
    const update = vi.fn(() => ({ set }))
    const repository = new CoexistSyncRunRepository()

    await repository.tearDownActiveRunsForIntegration({
      channel: "whatsapp",
      integrationId: "int-1",
      currentError: "Coexist disabled",
      tx: { update } as never,
    })

    expect(mocks.inArray).toHaveBeenCalledWith("status", [
      "init",
      "running",
      "waiting",
    ])
  })
})
