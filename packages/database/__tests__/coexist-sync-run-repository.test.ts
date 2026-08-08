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
})
