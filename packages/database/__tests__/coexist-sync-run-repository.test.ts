import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  inArray: vi.fn((column: unknown, values: unknown[]) => ({
    inArray: [column, values],
  })),
  isUniqueViolationError: vi.fn(),
  lt: vi.fn((column: unknown, value: unknown) => ({ lt: [column, value] })),
  ne: vi.fn((column: unknown, value: unknown) => ({ ne: [column, value] })),
  or: vi.fn((...conditions: unknown[]) => ({ or: conditions })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: [strings, values],
  })),
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

describe("CoexistSyncRunRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isUniqueViolationError.mockReturnValue(false)
  })

  test("claimRun only claims active init/running runs", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "run-1" }])
    const where = vi.fn(() => ({ returning }))
    const set = vi.fn(() => ({ where }))
    const update = vi.fn(() => ({ set }))
    const repository = new CoexistSyncRunRepository()

    await expect(
      repository.claimRun({
        runId: "run-1",
        tx: { update } as never,
      }),
    ).resolves.toEqual({ id: "run-1" })

    expect(mocks.inArray).toHaveBeenCalledWith("status", ["init", "running"])
    expect(where).toHaveBeenCalledWith(
      expect.objectContaining({
        and: expect.arrayContaining([
          { eq: ["runId", "run-1"] },
          { inArray: ["status", ["init", "running"]] },
        ]),
      }),
    )
  })

  test("createRun returns the inserted run on the happy path", async () => {
    const insertReturning = vi.fn().mockResolvedValue([{ id: "new-run" }])
    const onConflictDoNothing = vi.fn(() => ({ returning: insertReturning }))
    const insertValues = vi.fn(() => ({ onConflictDoNothing }))
    const insert = vi.fn(() => ({ values: insertValues }))
    const findFirst = vi.fn()
    const repository = new CoexistSyncRunRepository()

    await expect(
      repository.createRun({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        channel: "instagram",
        triggerSource: "popup-enable",
        tx: {
          insert,
          query: { coexistSyncRunModel: { findFirst } },
        } as never,
      }),
    ).resolves.toEqual({ id: "new-run" })

    // No conflict → must NOT re-select. onConflictDoNothing keeps a duplicate
    // from aborting the caller's transaction.
    expect(onConflictDoNothing).toHaveBeenCalled()
    expect(findFirst).not.toHaveBeenCalled()
  })

  test("createRun returns the existing init run on duplicate enable without throwing", async () => {
    // onConflictDoNothing resolves to an empty array on conflict (no error is
    // raised, so the caller's transaction is NOT aborted); the repository then
    // re-selects the existing active init run.
    const insertReturning = vi.fn().mockResolvedValue([])
    const onConflictDoNothing = vi.fn(() => ({ returning: insertReturning }))
    const insertValues = vi.fn(() => ({ onConflictDoNothing }))
    const insert = vi.fn(() => ({ values: insertValues }))
    const findFirst = vi.fn().mockResolvedValue({ id: "existing-run" })
    const repository = new CoexistSyncRunRepository()

    await expect(
      repository.createRun({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        channel: "instagram",
        triggerSource: "popup-enable",
        tx: {
          insert,
          query: { coexistSyncRunModel: { findFirst } },
        } as never,
      }),
    ).resolves.toEqual({ id: "existing-run" })

    expect(onConflictDoNothing).toHaveBeenCalled()
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        integrationId: "integration-1",
        channel: "instagram",
        status: "init",
      },
    })
  })

  test("createRun throws when a conflict yields no re-selectable init run", async () => {
    const insertReturning = vi.fn().mockResolvedValue([])
    const onConflictDoNothing = vi.fn(() => ({ returning: insertReturning }))
    const insertValues = vi.fn(() => ({ onConflictDoNothing }))
    const insert = vi.fn(() => ({ values: insertValues }))
    const findFirst = vi.fn().mockResolvedValue(undefined)
    const repository = new CoexistSyncRunRepository()

    await expect(
      repository.createRun({
        workspaceId: "workspace-1",
        integrationId: "integration-1",
        channel: "instagram",
        triggerSource: "popup-enable",
        tx: {
          insert,
          query: { coexistSyncRunModel: { findFirst } },
        } as never,
      }),
    ).rejects.toThrow("no active init run")
  })

  test("findIntegrationForCoexist admits a Facebook-linked Instagram row without a type filter", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "ig-fb-1",
      workspaceId: "ws-1",
      type: "facebook",
    })
    const repository = new CoexistSyncRunRepository()

    const row = await repository.findIntegrationForCoexist({
      channel: "instagram",
      workspaceId: "ws-1",
      integrationId: "ig-fb-1",
      tx: {
        query: { integrationInstagramModel: { findFirst } },
      } as never,
    })

    // Lookup must not constrain by `type` — both native ("instagram") and
    // Facebook-linked ("facebook") rows are admitted; the worker routes by type.
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "ig-fb-1", workspaceId: "ws-1" },
    })
    expect(findFirst.mock.calls[0]?.[0]?.where).not.toHaveProperty("type")
    expect(row).toEqual({
      id: "ig-fb-1",
      workspaceId: "ws-1",
      type: "facebook",
      channel: "instagram",
    })
  })

  // --- Regression guards for the worker data-access refactor -------------
  // `claimRunForSync` is deliberately NOT `claimRun`: the coexist sync claim
  // omits the `status IN ('init','running')` filter so a retry can reclaim a
  // `failed`/`partial` run. Re-adding that filter silently breaks retry
  // recovery, so assert its absence explicitly.

  test("claimRunForSync does NOT filter status IN ('init','running')", async () => {
    const returning = vi.fn().mockResolvedValue([{ id: "run-1" }])
    const where = vi.fn(() => ({ returning }))
    const set = vi.fn(() => ({ where }))
    const update = vi.fn(() => ({ set }))
    const repository = new CoexistSyncRunRepository()

    await expect(
      repository.claimRunForSync({
        runId: "run-1",
        touchUpdatedAt: true,
        tx: { update } as never,
      }),
    ).resolves.toEqual({ id: "run-1" })

    expect(mocks.inArray).not.toHaveBeenCalled()
    // The stale-heartbeat fallback is the whole point of the claim: either the
    // run is not currently running, or its heartbeat has gone stale.
    expect(mocks.ne).toHaveBeenCalledWith("status", "running")
    expect(mocks.lt).toHaveBeenCalledWith("lastHeartbeatAt", expect.anything())
    expect(where).toHaveBeenCalledWith(
      expect.objectContaining({
        and: expect.arrayContaining([{ eq: ["runId", "run-1"] }]),
      }),
    )
  })

  test("claimRunForSync touches updatedAt only when asked (messenger-sync yes, whatsapp-flush no)", async () => {
    const repository = new CoexistSyncRunRepository()

    const makeTx = () => {
      const returning = vi.fn().mockResolvedValue([{ id: "run-1" }])
      const where = vi.fn(() => ({ returning }))
      const set = vi.fn(() => ({ where }))
      return { set, tx: { update: vi.fn(() => ({ set })) } as never }
    }

    const touched = makeTx()
    await repository.claimRunForSync({
      runId: "run-1",
      touchUpdatedAt: true,
      tx: touched.tx,
    })
    expect(touched.set.mock.calls[0]?.[0]).toHaveProperty("updatedAt")

    const untouched = makeTx()
    await repository.claimRunForSync({
      runId: "run-1",
      touchUpdatedAt: false,
      tx: untouched.tx,
    })
    expect(untouched.set.mock.calls[0]?.[0]).not.toHaveProperty("updatedAt")
  })

  test("incrementProgress uses an atomic `col + N` expression, never a read-modify-write", async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn(() => ({ where }))
    const update = vi.fn(() => ({ set }))
    const select = vi.fn()
    const findFirst = vi.fn()
    const repository = new CoexistSyncRunRepository()

    await repository.incrementProgress({
      runId: "run-1",
      increments: { importedMessageCount: 5, skippedCount: 2 },
      fields: { currentStep: "importing" },
      tx: {
        update,
        select,
        query: { coexistSyncRunModel: { findFirst } },
      } as never,
    })

    // No prior read: a read-modify-write would reintroduce a lost update
    // across the two concurrent coexist phase workers.
    expect(select).not.toHaveBeenCalled()
    expect(findFirst).not.toHaveBeenCalled()

    const setArg = set.mock.calls[0]?.[0] as Record<string, unknown>
    // Each counter is a `sql` template of the form `<column> + <amount>`.
    expect(setArg.importedMessageCount).toEqual({
      sql: [expect.anything(), ["importedMessageCount", 5]],
    })
    expect(setArg.skippedCount).toEqual({
      sql: [expect.anything(), ["skippedCount", 2]],
    })
    const [strings] = (
      setArg.importedMessageCount as { sql: [string[], unknown[]] }
    ).sql
    expect(strings.join("")).toContain("+")
    // Plain-value fields ride along untouched.
    expect(setArg.currentStep).toBe("importing")
    expect(where).toHaveBeenCalledWith({ eq: ["runId", "run-1"] })
  })

  test("incrementProgress skips counters whose increment is undefined", async () => {
    const where = vi.fn().mockResolvedValue(undefined)
    const set = vi.fn(() => ({ where }))
    const repository = new CoexistSyncRunRepository()

    await repository.incrementProgress({
      runId: "run-1",
      increments: { currentScan: 1, failedCount: undefined },
      tx: { update: vi.fn(() => ({ set })) } as never,
    })

    const setArg = set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg).toHaveProperty("currentScan")
    expect(setArg).not.toHaveProperty("failedCount")
  })
})
