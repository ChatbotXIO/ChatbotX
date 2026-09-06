import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// sequenceDispatchRepository — the query/claim/delete surface backing the
// sequence-scheduler worker (dispatch-processor, worker-producer, worker's
// reconcile/cleanup/retention loops, step-executor). Mocks `db` at the module
// boundary (query builder chain), asserting shapes without touching a real
// database or importOriginal-ing the schema module.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ and: conditions })),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: [strings, values],
  })),
  execute: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  findFirstStep: vi.fn(),
  update: vi.fn(),
}))

vi.mock("../src/client", () => ({
  and: mocks.and,
  eq: mocks.eq,
  sql: mocks.sql,
  db: {
    execute: mocks.execute,
    update: mocks.update,
    query: {
      sequenceDispatchModel: {
        findFirst: mocks.findFirst,
        findMany: mocks.findMany,
      },
      sequenceStepModel: {
        findFirst: mocks.findFirstStep,
      },
    },
  },
}))

vi.mock("../src/schema", () => ({
  sequenceDispatchModel: {
    id: "id",
    workspaceId: "workspaceId",
    status: "status",
  },
}))

const { sequenceDispatchRepository } = await import(
  "../src/repositories/sequence-dispatch/repository"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("findWithRelations", () => {
  test("scopes by id, status, and workspaceId with sequence/contact/enrollment relations", async () => {
    const row = { id: "d-1", status: "pending", workspaceId: "ws-1" }
    mocks.findFirst.mockResolvedValue(row)

    const result = await sequenceDispatchRepository.findWithRelations({
      id: "d-1",
      status: "pending",
      workspaceId: "ws-1",
    })

    expect(result).toEqual(row)
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id: "d-1", status: "pending", workspaceId: "ws-1" },
      with: { sequence: true, contact: true, enrollment: true },
    })
  })

  test("returns null when no row matches", async () => {
    mocks.findFirst.mockResolvedValue(undefined)
    await expect(
      sequenceDispatchRepository.findWithRelations({
        id: "d-missing",
        status: "pending",
        workspaceId: "ws-1",
      }),
    ).resolves.toBeNull()
  })
})

describe("claim", () => {
  test("issues a status='pending' CAS update and returns true when a row was affected", async () => {
    const returning = vi.fn(() => Promise.resolve([{ id: "d-1" }]))
    const where = vi.fn(() => ({ returning }))
    const set = vi.fn(() => ({ where }))
    mocks.update.mockReturnValue({ set })

    const result = await sequenceDispatchRepository.claim({
      id: "d-1",
      workspaceId: "ws-1",
      lockOwner: "host-1",
    })

    expect(result).toBe(true)
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "running", lockOwner: "host-1" }),
    )
    // The pending-status predicate must be part of the WHERE — never a
    // read-then-write.
    expect(mocks.eq).toHaveBeenCalledWith("status", "pending")
  })

  test("returns false when the row was no longer pending (lost the race)", async () => {
    const returning = vi.fn(() => Promise.resolve([]))
    const where = vi.fn(() => ({ returning }))
    const set = vi.fn(() => ({ where }))
    mocks.update.mockReturnValue({ set })

    const result = await sequenceDispatchRepository.claim({
      id: "d-1",
      workspaceId: "ws-1",
      lockOwner: "host-1",
    })

    expect(result).toBe(false)
  })
})

describe("listPendingWorkspaceIds", () => {
  test("returns [] without querying when ids is empty", async () => {
    const result = await sequenceDispatchRepository.listPendingWorkspaceIds({
      ids: [],
    })
    expect(result).toEqual([])
    expect(mocks.findMany).not.toHaveBeenCalled()
  })

  test("scopes to the given ids and status=pending", async () => {
    mocks.findMany.mockResolvedValue([{ id: "d-1", workspaceId: "ws-1" }])

    const result = await sequenceDispatchRepository.listPendingWorkspaceIds({
      ids: ["d-1"],
    })

    expect(result).toEqual([{ id: "d-1", workspaceId: "ws-1" }])
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["d-1"] }, status: "pending" },
      columns: { id: true, workspaceId: true },
    })
  })
})

describe("listPendingForReconcile", () => {
  test("pages by runAtMs ascending, scoped to status=pending", async () => {
    mocks.findMany.mockResolvedValue([])

    await sequenceDispatchRepository.listPendingForReconcile({
      maxRunAtMs: "1000",
      offset: 0,
      limit: 1000,
    })

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "pending", runAtMs: { lte: "1000" } },
        offset: 0,
        limit: 1000,
      }),
    )
  })
})

describe("listPendingIds", () => {
  test("returns [] without querying when ids is empty", async () => {
    const result = await sequenceDispatchRepository.listPendingIds({
      ids: [],
    })
    expect(result).toEqual([])
    expect(mocks.findMany).not.toHaveBeenCalled()
  })
})

describe("deleteTerminalBatch", () => {
  test("deletes terminal rows via the CTE joined on workspaceId for partition pruning", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ id: "d-1" }, { id: "d-2" }] })

    const result = await sequenceDispatchRepository.deleteTerminalBatch({
      retentionTtlDays: 30,
      batchSize: 1000,
    })

    expect(result).toBe(2)
    expect(mocks.execute).toHaveBeenCalledTimes(1)
    // The outer sql-tag call carries the "SequenceDispatch"/rows join text as
    // string segments and the bound retentionTtlDays/batchSize as the
    // template's interpolated values (each call to the mocked `sql` tag is
    // one template literal — retentionTtlDays and batchSize are each their
    // own interpolation, so it's the LAST call (outermost, executed first by
    // JS evaluation order... actually the outer template is evaluated last
    // since inner ${} expressions run first). Assert the outer call's text.
    const outerCall = mocks.sql.mock.calls.at(-1) as [
      TemplateStringsArray,
      unknown[],
    ]
    const [strings] = outerCall
    const renderedText = strings.join("")
    expect(renderedText).toContain("WITH rows AS")
    expect(renderedText).toContain('"SequenceDispatch"')
    expect(renderedText).toContain('sd."workspaceId" = rows."workspaceId"')
  })
})

describe("findStepWithFlow", () => {
  test("delegates to sequenceStepModel with the flow relation", async () => {
    mocks.findFirstStep.mockResolvedValue({ id: "step-1", flow: { id: "f-1" } })

    const result = await sequenceDispatchRepository.findStepWithFlow({
      id: "step-1",
    })

    expect(result).toEqual({ id: "step-1", flow: { id: "f-1" } })
    expect(mocks.findFirstStep).toHaveBeenCalledWith({
      where: { id: "step-1" },
      with: { flow: true },
    })
  })
})
