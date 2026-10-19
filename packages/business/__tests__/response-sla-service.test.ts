import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findPolicy: vi.fn(),
  upsertPolicy: vi.fn(),
  deletePolicy: vi.fn(),
  readWindowStates: vi.fn(),
  areWindowsAlreadyOpen: vi.fn(),
  readAssigneeIds: vi.fn(),
  setSnapshotIfWindowUnchanged: vi.fn(),
  clearSnapshotIfWindowUnchanged: vi.fn(),
  clearWorkspaceSnapshots: vi.fn(),
  findForAgent: vi.fn(),
  findDateOverridesFor: vi.fn(),
  findDateOverridesForSchedules: vi.fn(),
  findWorkspace: vi.fn(),
  invalidateCacheByTags: vi.fn(async () => undefined),
  dispatchAuditRecord: vi.fn(),
  transaction: vi.fn(),
  withCache: vi.fn(async (_key: string, fn: () => Promise<unknown>) => fn()),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      mocks.transaction(fn),
  },
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  responseSlaRepository: {
    findPolicy: mocks.findPolicy,
    upsertPolicy: mocks.upsertPolicy,
    deletePolicy: mocks.deletePolicy,
    readWindowStates: mocks.readWindowStates,
    areWindowsAlreadyOpen: mocks.areWindowsAlreadyOpen,
    readAssigneeIds: mocks.readAssigneeIds,
    setSnapshotIfWindowUnchanged: mocks.setSnapshotIfWindowUnchanged,
    clearSnapshotIfWindowUnchanged: mocks.clearSnapshotIfWindowUnchanged,
    clearWorkspaceSnapshots: mocks.clearWorkspaceSnapshots,
  },
}))
vi.mock("@chatbotx.io/redis", () => ({
  withCache: mocks.withCache,
  invalidateCacheByTags: mocks.invalidateCacheByTags,
}))
vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: mocks.dispatchAuditRecord,
}))
vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock("../src/working-hours/service", () => ({
  workingHoursService: {
    findForAgent: mocks.findForAgent,
    findDateOverridesFor: mocks.findDateOverridesFor,
    findDateOverridesForSchedules: mocks.findDateOverridesForSchedules,
  },
}))
vi.mock("../src/workspace/service", () => ({
  workspaceService: { find: mocks.findWorkspace },
}))

const { responseSlaService } = await import("../src/response-sla/service")

const WS = "ws-1"
const policy = {
  id: "p1",
  workspaceId: WS,
  enabled: true,
  firstResponseTargetSeconds: 3600,
  nextResponseTargetSeconds: 1800,
  breachingThresholdPercent: 25,
}
const since = new Date("2026-06-01T10:00:00Z")
const state = (over: Record<string, unknown> = {}) => ({
  id: "c1",
  sourceId: null,
  awaitingHumanReplySince: null,
  assignedUserId: null,
  assignedUserAt: null,
  adminRepliedAt: null,
  responseDueAt: null,
  responseSlaTargetSeconds: null,
  ...over,
})
const client: { client: boolean; transaction: unknown } = {
  client: true,
  transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(client),
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.withCache.mockImplementation(async (_key, fn) => fn())
  mocks.findPolicy.mockResolvedValue(policy)
  mocks.findForAgent.mockResolvedValue(null)
  mocks.readAssigneeIds.mockResolvedValue([])
  mocks.areWindowsAlreadyOpen.mockResolvedValue(false)
  mocks.findDateOverridesFor.mockResolvedValue(new Map())
  mocks.findDateOverridesForSchedules.mockResolvedValue(new Map())
  mocks.findWorkspace.mockResolvedValue({ id: WS, timezone: "UTC" })
  mocks.setSnapshotIfWindowUnchanged.mockResolvedValue(true)
  mocks.transaction.mockImplementation(async (fn) => fn(client))
})

describe("policy", () => {
  test("is cached as a wrapper so 'no policy' is cacheable, under its own tag", async () => {
    mocks.findPolicy.mockResolvedValueOnce(undefined)

    await expect(
      responseSlaService.findPolicy({ workspaceId: WS }),
    ).resolves.toBeNull()

    const [key, , opts] = mocks.withCache.mock.calls[0]
    expect(key).toBe("response-sla:ws-1:policy")
    expect(opts).toEqual({ ttl: 3600, tags: ["response-sla:ws-1"] })
  })

  test("upsert validates ranges, writes, and invalidates", async () => {
    const data = {
      enabled: true,
      firstResponseTargetSeconds: 300,
      nextResponseTargetSeconds: null,
      breachingThresholdPercent: 20,
    }
    mocks.upsertPolicy.mockResolvedValue({ ...policy, ...data })

    await responseSlaService.upsertPolicy({ workspaceId: WS, data })

    expect(mocks.upsertPolicy).toHaveBeenCalledWith(
      { workspaceId: WS, data },
      expect.anything(),
    )
    expect(mocks.invalidateCacheByTags).toHaveBeenCalledWith([
      "response-sla:ws-1",
    ])
  })

  test("switching it off drops every open window's snapshot; keeping it on does not", async () => {
    const data = {
      enabled: false,
      firstResponseTargetSeconds: 300,
      nextResponseTargetSeconds: null,
      breachingThresholdPercent: 25,
    }
    mocks.upsertPolicy.mockResolvedValue({ ...policy, ...data })
    await responseSlaService.upsertPolicy({ workspaceId: WS, data })
    expect(mocks.clearWorkspaceSnapshots).toHaveBeenCalledWith(
      { workspaceId: WS },
      expect.anything(),
    )

    mocks.clearWorkspaceSnapshots.mockClear()
    mocks.upsertPolicy.mockResolvedValue({ ...policy, enabled: true })
    await responseSlaService.upsertPolicy({
      workspaceId: WS,
      data: { ...data, enabled: true },
    })
    expect(mocks.clearWorkspaceSnapshots).not.toHaveBeenCalled()
  })

  test("removing the policy drops the snapshots too", async () => {
    mocks.deletePolicy.mockResolvedValue(true)

    await responseSlaService.deletePolicy({ workspaceId: WS })

    expect(mocks.clearWorkspaceSnapshots).toHaveBeenCalledWith(
      { workspaceId: WS },
      expect.anything(),
    )
  })

  test.each([
    [{ firstResponseTargetSeconds: 10 }, "firstResponseTargetSeconds"],
    [
      { firstResponseTargetSeconds: 60 * 24 * 3600 },
      "firstResponseTargetSeconds",
    ],
    [{ nextResponseTargetSeconds: 5 }, "nextResponseTargetSeconds"],
    [{ breachingThresholdPercent: 0 }, "breachingThresholdPercent"],
    [{ breachingThresholdPercent: 100 }, "breachingThresholdPercent"],
    [{ firstResponseTargetSeconds: 90.5 }, "firstResponseTargetSeconds"],
  ])("upsert rejects %j before touching the database", async (bad, field) => {
    const data = {
      enabled: true,
      firstResponseTargetSeconds: 300,
      nextResponseTargetSeconds: null,
      breachingThresholdPercent: 25,
      ...bad,
    }

    await expect(
      responseSlaService.upsertPolicy({ workspaceId: WS, data }),
    ).rejects.toMatchObject({ field })
    expect(mocks.upsertPolicy).not.toHaveBeenCalled()
  })
})

describe("policy bounds", () => {
  const base = {
    enabled: true,
    firstResponseTargetSeconds: 300,
    nextResponseTargetSeconds: null,
    breachingThresholdPercent: 25,
  }

  test.each([
    [{ firstResponseTargetSeconds: 60 }],
    [{ firstResponseTargetSeconds: 2_592_000 }],
    [{ nextResponseTargetSeconds: 60 }],
    [{ nextResponseTargetSeconds: 2_592_000 }],
    [{ breachingThresholdPercent: 1 }],
    [{ breachingThresholdPercent: 99 }],
  ])("accepts the exact limit %j", async (edge) => {
    mocks.upsertPolicy.mockResolvedValue({ ...policy, ...base, ...edge })

    await expect(
      responseSlaService.upsertPolicy({
        workspaceId: WS,
        data: { ...base, ...edge },
      }),
    ).resolves.toBeDefined()
  })

  test.each([
    [{ firstResponseTargetSeconds: 59 }, "firstResponseTargetSeconds"],
    [{ firstResponseTargetSeconds: 2_592_001 }, "firstResponseTargetSeconds"],
    [{ nextResponseTargetSeconds: 59 }, "nextResponseTargetSeconds"],
    [{ nextResponseTargetSeconds: 2_592_001 }, "nextResponseTargetSeconds"],
    [{ breachingThresholdPercent: Number.NaN }, "breachingThresholdPercent"],
    [{ breachingThresholdPercent: 50.5 }, "breachingThresholdPercent"],
  ])("rejects just outside the limit %j", async (edge, field) => {
    await expect(
      responseSlaService.upsertPolicy({
        workspaceId: WS,
        data: { ...base, ...edge },
      }),
    ).rejects.toMatchObject({ field })
  })
})

describe("computeSnapshot", () => {
  const monToFri = Array.from({ length: 5 }, (_, index) => ({
    weekday: index + 1,
    startMinute: 540,
    endMinute: 1020,
  }))
  const compute = (start: string, over: Record<string, number> = {}) =>
    responseSlaService.computeSnapshot({
      workspaceId: WS,
      assignedUserId: "u1",
      start: new Date(start),
      targetSeconds: 3600,
      breachingThresholdPercent: 25,
      ...over,
    })

  beforeEach(() => {
    mocks.findForAgent.mockResolvedValue({
      workingHoursId: "wh-1",
      intervals: monToFri,
    })
  })

  test("Friday evening rolls over the weekend to Monday morning", async () => {
    const snapshot = await compute("2026-06-05T16:30:00Z")
    expect(snapshot?.responseDueAt).toEqual(new Date("2026-06-08T09:30:00Z"))
  })

  test("a holiday on that Monday pushes the deadline to Tuesday", async () => {
    mocks.findDateOverridesFor.mockResolvedValue(new Map([["2026-06-08", []]]))
    const snapshot = await compute("2026-06-05T16:30:00Z")
    expect(snapshot?.responseDueAt).toEqual(new Date("2026-06-09T09:30:00Z"))
  })

  test("holiday plus a closed Tuesday for this schedule skips both", async () => {
    mocks.findDateOverridesFor.mockResolvedValue(
      new Map([
        ["2026-06-08", []],
        ["2026-06-09", []],
      ]),
    )
    const snapshot = await compute("2026-06-05T16:30:00Z")
    expect(snapshot?.responseDueAt).toEqual(new Date("2026-06-10T09:30:00Z"))
  })

  test("an override that opens a weekend day is used (half-day Saturday)", async () => {
    mocks.findDateOverridesFor.mockResolvedValue(
      new Map([["2026-06-06", [{ startMinute: 600, endMinute: 720 }]]]),
    )
    const snapshot = await compute("2026-06-05T16:30:00Z")
    // 30 min left Friday + 30 min Saturday from 10:00.
    expect(snapshot?.responseDueAt).toEqual(new Date("2026-06-06T10:30:00Z"))
  })

  test("a message before opening starts counting at opening", async () => {
    const snapshot = await compute("2026-06-01T07:00:00Z")
    expect(snapshot?.responseDueAt).toEqual(new Date("2026-06-01T10:00:00Z"))
  })

  test("a message exactly at closing time starts the next open day", async () => {
    const snapshot = await compute("2026-06-01T17:00:00Z")
    expect(snapshot?.responseDueAt).toEqual(new Date("2026-06-02T10:00:00Z"))
  })

  test("a deadline landing exactly on closing time stays that day", async () => {
    const snapshot = await compute("2026-06-01T16:00:00Z")
    expect(snapshot?.responseDueAt).toEqual(new Date("2026-06-01T17:00:00Z"))
  })

  test("the shortest target with the widest threshold still breaches after the start", async () => {
    const snapshot = await compute("2026-06-01T10:00:00Z", {
      targetSeconds: 60,
      breachingThresholdPercent: 99,
    })
    expect(snapshot?.responseSlaBreachingAt.getTime()).toBeGreaterThan(
      new Date("2026-06-01T10:00:00Z").getTime(),
    )
    expect(snapshot?.responseSlaBreachingAt.getTime()).toBeLessThanOrEqual(
      snapshot?.responseDueAt.getTime() ?? 0,
    )
  })

  test("breaching never lands after the deadline", async () => {
    const snapshot = await compute("2026-06-05T16:50:00Z", {
      breachingThresholdPercent: 1,
    })
    expect(snapshot?.responseSlaBreachingAt.getTime()).toBeLessThanOrEqual(
      snapshot?.responseDueAt.getTime() ?? 0,
    )
  })

  test("a workspace timezone shifts the local opening (Ho Chi Minh, UTC+7)", async () => {
    mocks.findWorkspace.mockResolvedValue({
      id: WS,
      timezone: "Asia/Ho_Chi_Minh",
    })
    // 09:00 local Monday = 02:00 UTC.
    const snapshot = await compute("2026-06-01T01:00:00Z")
    expect(snapshot?.responseDueAt).toEqual(new Date("2026-06-01T03:00:00Z"))
  })

  test("an unassigned conversation is counted in calendar time", async () => {
    const snapshot = await responseSlaService.computeSnapshot({
      workspaceId: WS,
      assignedUserId: null,
      start: since,
      targetSeconds: 3600,
      breachingThresholdPercent: 25,
    })

    expect(snapshot).toEqual({
      responseDueAt: new Date("2026-06-01T11:00:00Z"),
      // 75% of the target has elapsed -> breaching.
      responseSlaBreachingAt: new Date("2026-06-01T10:45:00Z"),
      responseSlaTargetSeconds: 3600,
    })
    expect(mocks.findForAgent).not.toHaveBeenCalled()
  })

  test("an agent without a schedule is counted in calendar time too", async () => {
    mocks.findForAgent.mockResolvedValue(null)

    const snapshot = await responseSlaService.computeSnapshot({
      workspaceId: WS,
      assignedUserId: "u1",
      start: since,
      targetSeconds: 600,
      breachingThresholdPercent: 50,
    })

    expect(snapshot?.responseDueAt).toEqual(new Date("2026-06-01T10:10:00Z"))
    expect(snapshot?.responseSlaBreachingAt).toEqual(
      new Date("2026-06-01T10:05:00Z"),
    )
  })

  test("a scheduled agent is counted in working time, breaching included", async () => {
    // Monday 09-17 only. Start Monday 16:30: 30 min today, rest next Monday.
    mocks.findForAgent.mockResolvedValue({
      workingHoursId: "wh-1",
      intervals: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
    })

    const snapshot = await responseSlaService.computeSnapshot({
      workspaceId: WS,
      assignedUserId: "u1",
      start: new Date("2026-06-01T16:30:00Z"),
      targetSeconds: 3600,
      breachingThresholdPercent: 50,
    })

    expect(snapshot?.responseDueAt).toEqual(new Date("2026-06-08T09:30:00Z"))
    // Half the target (30 min) is consumed before today's closing time.
    expect(snapshot?.responseSlaBreachingAt).toEqual(
      new Date("2026-06-01T17:00:00Z"),
    )
  })

  test("a deadline beyond the cached override window retries once with a full-year read", async () => {
    mocks.findForAgent.mockResolvedValue({
      workingHoursId: "wh-1",
      // Opens one hour a week; 20 hours need 140 days, more than the 55 the cache covers.
      intervals: [{ weekday: 1, startMinute: 0, endMinute: 60 }],
    })

    const snapshot = await responseSlaService.computeSnapshot({
      workspaceId: WS,
      assignedUserId: "u1",
      start: new Date("2026-06-01T00:00:00Z"),
      targetSeconds: 20 * 3600,
      breachingThresholdPercent: 25,
    })

    expect(snapshot).not.toBeNull()
    expect(mocks.findDateOverridesFor).toHaveBeenCalledTimes(2)
    const spans = mocks.findDateOverridesFor.mock.calls.map(
      ([arg]) => (arg.to.getTime() - arg.from.getTime()) / 86_400_000,
    )
    expect(spans).toEqual([55, 366])
  })

  test("an empty weekly schedule still finds a later opening override within the year", async () => {
    mocks.findForAgent.mockResolvedValue({
      workingHoursId: "wh-1",
      intervals: [],
    })
    // Nothing opens in the cached 55-day window; the full-year read finds one.
    mocks.findDateOverridesFor
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(
        new Map([["2026-08-01", [{ startMinute: 540, endMinute: 600 }]]]),
      )

    const snapshot = await responseSlaService.computeSnapshot({
      workspaceId: WS,
      assignedUserId: "u1",
      start: new Date("2026-06-01T00:00:00Z"),
      targetSeconds: 3600,
      breachingThresholdPercent: 25,
    })

    expect(snapshot?.responseDueAt).toEqual(new Date("2026-08-01T10:00:00Z"))
    expect(mocks.findDateOverridesFor).toHaveBeenCalledTimes(2)
  })

  test("returns null (no SLA) when the deadline is unreachable within a year", async () => {
    mocks.findForAgent.mockResolvedValue({
      workingHoursId: "wh-1",
      intervals: [],
    })

    await expect(
      responseSlaService.computeSnapshot({
        workspaceId: WS,
        assignedUserId: "u1",
        start: since,
        targetSeconds: 600,
        breachingThresholdPercent: 25,
      }),
    ).resolves.toBeNull()
  })
})

describe("trackWindow", () => {
  const run = vi.fn()
  beforeEach(() => run.mockReset().mockResolvedValue("result"))

  test("without a policy it only runs the statement", async () => {
    mocks.findPolicy.mockResolvedValue(undefined)

    await expect(
      responseSlaService.trackWindow(
        { workspaceId: WS, conversationIds: ["c1"], tx: client as never },
        run,
      ),
    ).resolves.toBe("result")

    expect(run).toHaveBeenCalledWith(client)
    expect(mocks.readWindowStates).not.toHaveBeenCalled()
  })

  test("another customer message in an open window only runs the statement", async () => {
    mocks.areWindowsAlreadyOpen.mockResolvedValue(true)

    await expect(
      responseSlaService.trackWindow(
        { workspaceId: WS, conversationIds: ["c1"], tx: client as never },
        run,
      ),
    ).resolves.toBe("result")

    expect(run).toHaveBeenCalledWith(client)
    expect(mocks.readWindowStates).not.toHaveBeenCalled()
    expect(mocks.readAssigneeIds).not.toHaveBeenCalled()
    expect(mocks.setSnapshotIfWindowUnchanged).not.toHaveBeenCalled()
  })

  test("a caller that may reassign never takes the fast path", async () => {
    mocks.areWindowsAlreadyOpen.mockResolvedValue(true)
    mocks.readWindowStates.mockResolvedValue([])

    await responseSlaService.trackWindow(
      {
        workspaceId: WS,
        conversationIds: ["c1"],
        assigneeHints: ["u1"],
        tx: client as never,
      },
      run,
    )

    expect(mocks.areWindowsAlreadyOpen).not.toHaveBeenCalled()
    expect(mocks.readWindowStates).toHaveBeenCalledTimes(2)
  })

  test("a failing peek falls back to the full path", async () => {
    mocks.areWindowsAlreadyOpen.mockRejectedValue(new Error("boom"))
    mocks.readWindowStates.mockResolvedValue([])

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"], tx: client as never },
      run,
    )

    expect(mocks.readWindowStates).toHaveBeenCalledTimes(2)
  })

  test("a statement that changes nothing skips the savepoint and the snapshot work", async () => {
    const openWindow = state({ awaitingHumanReplySince: since })
    mocks.readWindowStates.mockResolvedValue([openWindow])
    const transaction = vi.fn()
    const tx = { ...client, transaction }

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"], tx: tx as never },
      run,
    )

    // Only the warm-up savepoint: no snapshot sync savepoint, no write.
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(mocks.setSnapshotIfWindowUnchanged).not.toHaveBeenCalled()
  })

  test("locks BEFORE the statement and reads after it, in the caller's transaction", async () => {
    mocks.readWindowStates.mockResolvedValue([])
    const order: string[] = []
    mocks.readWindowStates.mockImplementation((props: { lock: boolean }) => {
      order.push(props.lock ? "lock" : "read")
      return Promise.resolve([])
    })
    run.mockImplementation(() => {
      order.push("run")
      return Promise.resolve("result")
    })

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"], tx: client as never },
      run,
    )

    expect(order).toEqual(["lock", "run", "read"])
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  test("opens its own transaction when the caller has none", async () => {
    mocks.readWindowStates.mockResolvedValue([])

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"] },
      run,
    )

    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith(client)
  })

  test("a window this statement opened gets the first-response deadline (compare-and-set on its start)", async () => {
    mocks.readWindowStates
      .mockResolvedValueOnce([state()])
      .mockResolvedValueOnce([state({ awaitingHumanReplySince: since })])

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"] },
      run,
    )

    expect(mocks.setSnapshotIfWindowUnchanged).toHaveBeenCalledWith(
      {
        workspaceId: WS,
        id: "c1",
        expectedSince: since,
        snapshot: {
          responseDueAt: new Date("2026-06-01T11:00:00Z"),
          responseSlaBreachingAt: new Date("2026-06-01T10:45:00Z"),
          responseSlaTargetSeconds: 3600,
        },
      },
      client,
    )
  })

  test("a later reply window uses the next-response target; none configured means no SLA", async () => {
    const answered = new Date("2026-06-01T09:00:00Z")
    mocks.readWindowStates
      .mockResolvedValueOnce([state({ adminRepliedAt: answered })])
      .mockResolvedValueOnce([
        state({ adminRepliedAt: answered, awaitingHumanReplySince: since }),
      ])
    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"] },
      run,
    )
    expect(
      mocks.setSnapshotIfWindowUnchanged.mock.calls[0][0].snapshot
        .responseSlaTargetSeconds,
    ).toBe(1800)

    mocks.setSnapshotIfWindowUnchanged.mockClear()
    mocks.findPolicy.mockResolvedValue({
      ...policy,
      nextResponseTargetSeconds: null,
    })
    mocks.readWindowStates
      .mockResolvedValueOnce([state({ adminRepliedAt: answered })])
      .mockResolvedValueOnce([
        state({ adminRepliedAt: answered, awaitingHumanReplySince: since }),
      ])
    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"] },
      run,
    )
    expect(mocks.setSnapshotIfWindowUnchanged).not.toHaveBeenCalled()
  })

  test("an already open window is NOT given a deadline retroactively", async () => {
    const open = state({ awaitingHumanReplySince: since })
    mocks.readWindowStates
      .mockResolvedValueOnce([open])
      .mockResolvedValueOnce([open])

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"] },
      run,
    )

    expect(mocks.setSnapshotIfWindowUnchanged).not.toHaveBeenCalled()
  })

  test("a comment thread never gets an SLA", async () => {
    mocks.readWindowStates
      .mockResolvedValueOnce([state({ sourceId: "post-1" })])
      .mockResolvedValueOnce([
        state({ sourceId: "post-1", awaitingHumanReplySince: since }),
      ])

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"] },
      run,
    )

    expect(mocks.setSnapshotIfWindowUnchanged).not.toHaveBeenCalled()
  })

  test("a real assignee change on an SLA window recomputes from the new agent; the target is kept", async () => {
    const withSla = {
      awaitingHumanReplySince: since,
      responseDueAt: new Date("2026-06-01T11:00:00Z"),
      responseSlaTargetSeconds: 3600,
    }
    mocks.readWindowStates
      .mockResolvedValueOnce([state({ ...withSla, assignedUserId: "u1" })])
      .mockResolvedValueOnce([state({ ...withSla, assignedUserId: "u2" })])

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"] },
      run,
    )

    expect(mocks.findForAgent).toHaveBeenCalledWith({
      workspaceId: WS,
      userId: "u2",
      tx: client,
    })
    expect(mocks.setSnapshotIfWindowUnchanged).toHaveBeenCalledTimes(1)
    expect(
      mocks.setSnapshotIfWindowUnchanged.mock.calls[0][0].snapshot
        .responseSlaTargetSeconds,
    ).toBe(3600)
  })

  test("reassigning to an agent whose calendar cannot supply the target drops the old deadline", async () => {
    const withSla = {
      awaitingHumanReplySince: since,
      responseDueAt: new Date("2026-06-01T11:00:00Z"),
      responseSlaTargetSeconds: 3600,
    }
    mocks.findForAgent.mockResolvedValue({
      workingHoursId: "wh-2",
      intervals: [],
    })
    mocks.readWindowStates
      .mockResolvedValueOnce([state({ ...withSla, assignedUserId: "u1" })])
      .mockResolvedValueOnce([state({ ...withSla, assignedUserId: "u2" })])

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"] },
      run,
    )

    expect(mocks.setSnapshotIfWindowUnchanged).not.toHaveBeenCalled()
    expect(mocks.clearSnapshotIfWindowUnchanged).toHaveBeenCalledWith(
      { workspaceId: WS, id: "c1", expectedSince: since },
      client,
    )
  })

  test("a window whose first deadline is unreachable is simply left without an SLA (nothing to clear)", async () => {
    mocks.findForAgent.mockResolvedValue({
      workingHoursId: "wh-2",
      intervals: [],
    })
    mocks.readWindowStates
      .mockResolvedValueOnce([state({ assignedUserId: "u1" })])
      .mockResolvedValueOnce([
        state({ assignedUserId: "u1", awaitingHumanReplySince: since }),
      ])

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"] },
      run,
    )

    expect(mocks.clearSnapshotIfWindowUnchanged).not.toHaveBeenCalled()
  })

  test.each([
    ["the same assignee", "u1", "u1"],
    ["a team-only change (assignee stays unassigned)", null, null],
  ])("%s does not recompute", async (_label, before, after) => {
    const withSla = {
      awaitingHumanReplySince: since,
      responseDueAt: new Date("2026-06-01T11:00:00Z"),
      responseSlaTargetSeconds: 3600,
    }
    mocks.readWindowStates
      .mockResolvedValueOnce([state({ ...withSla, assignedUserId: before })])
      .mockResolvedValueOnce([state({ ...withSla, assignedUserId: after })])

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"] },
      run,
    )

    expect(mocks.setSnapshotIfWindowUnchanged).not.toHaveBeenCalled()
  })

  test("unassigning recomputes in calendar time from the window start", async () => {
    const withSla = {
      awaitingHumanReplySince: since,
      responseDueAt: new Date("2026-06-03T09:00:00Z"),
      responseSlaTargetSeconds: 3600,
    }
    mocks.readWindowStates
      .mockResolvedValueOnce([state({ ...withSla, assignedUserId: "u1" })])
      .mockResolvedValueOnce([state({ ...withSla, assignedUserId: null })])

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"] },
      run,
    )

    expect(
      mocks.setSnapshotIfWindowUnchanged.mock.calls[0][0].snapshot
        .responseDueAt,
    ).toEqual(new Date("2026-06-01T11:00:00Z"))
  })

  test("the measured start moves to the assignment instant when assigned after the message", async () => {
    const assignedAt = new Date("2026-06-01T10:30:00Z")
    mocks.readWindowStates
      .mockResolvedValueOnce([state()])
      .mockResolvedValueOnce([
        state({
          awaitingHumanReplySince: since,
          assignedUserId: "u1",
          assignedUserAt: assignedAt,
        }),
      ])

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"] },
      run,
    )

    expect(
      mocks.setSnapshotIfWindowUnchanged.mock.calls[0][0].snapshot
        .responseDueAt,
    ).toEqual(new Date("2026-06-01T11:30:00Z"))
  })

  test("warms the lookups BEFORE the row lock so a cold cache never waits on the pool while locked", async () => {
    const order: string[] = []
    mocks.findWorkspace.mockImplementation(() => {
      order.push("warm")
      return Promise.resolve({ id: WS, timezone: "UTC" })
    })
    mocks.readWindowStates.mockImplementation((props: { lock: boolean }) => {
      order.push(props.lock ? "lock" : "read")
      return Promise.resolve([])
    })

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"] },
      run,
    )

    expect(order.indexOf("warm")).toBeLessThan(order.indexOf("lock"))
  })

  test("warms the schedule of the current assignee and of the hinted assignee before the lock", async () => {
    const order: string[] = []
    mocks.findForAgent.mockImplementation(({ userId }: { userId: string }) => {
      order.push(`warm:${userId}`)
      return Promise.resolve(null)
    })
    mocks.readAssigneeIds.mockResolvedValue(["u-current"])
    mocks.readWindowStates.mockImplementation((props: { lock: boolean }) => {
      order.push(props.lock ? "lock" : "read")
      return Promise.resolve([])
    })

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"], assigneeHints: ["u-new"] },
      run,
    )

    expect(order.indexOf("warm:u-current")).toBeLessThan(order.indexOf("lock"))
    expect(order.indexOf("warm:u-new")).toBeLessThan(order.indexOf("lock"))
  })

  test("with a caller transaction, the policy and assignee reads reuse its connection", async () => {
    mocks.readWindowStates.mockResolvedValue([])

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"], tx: client as never },
      run,
    )

    expect(mocks.findPolicy).toHaveBeenCalledWith({ workspaceId: WS }, client)
    expect(mocks.readAssigneeIds).toHaveBeenCalledWith(
      { workspaceId: WS, ids: ["c1"] },
      client,
    )
  })

  test("with a caller transaction every SLA read runs in a savepoint, so a rejected query cannot abort it", async () => {
    const savepoint = vi.spyOn(client, "transaction")
    mocks.readWindowStates.mockResolvedValue([])

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"], tx: client as never },
      run,
    )

    // policy cache miss + warm-up; the snapshot sync savepoint only opens when
    // a window was opened or reassigned (nothing changed here).
    expect(savepoint).toHaveBeenCalledTimes(2)
    savepoint.mockRestore()
  })

  test("a disabled policy keeps its targets but tracks nothing", async () => {
    mocks.findPolicy.mockResolvedValue({ ...policy, enabled: false })

    await expect(
      responseSlaService.trackWindow(
        { workspaceId: WS, conversationIds: ["c1"] },
        run,
      ),
    ).resolves.toBe("result")

    expect(mocks.readWindowStates).not.toHaveBeenCalled()
    expect(mocks.setSnapshotIfWindowUnchanged).not.toHaveBeenCalled()
  })

  test("a cached 'no policy' with a caller transaction costs no database round-trip (no savepoint)", async () => {
    const savepoint = vi.spyOn(client, "transaction")
    mocks.withCache.mockResolvedValueOnce({ policy: null })

    await responseSlaService.trackWindow(
      { workspaceId: WS, conversationIds: ["c1"], tx: client as never },
      run,
    )

    expect(savepoint).not.toHaveBeenCalled()
    expect(mocks.findPolicy).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledWith(client)
    savepoint.mockRestore()
  })

  test("a failing policy read means no SLA, never a failed write", async () => {
    mocks.findPolicy.mockRejectedValue(new Error("pool timeout"))

    await expect(
      responseSlaService.trackWindow(
        { workspaceId: WS, conversationIds: ["c1"] },
        run,
      ),
    ).resolves.toBe("result")
    expect(mocks.readWindowStates).not.toHaveBeenCalled()
  })

  test("a failing warm-up never fails the write", async () => {
    mocks.findWorkspace.mockRejectedValue(new Error("redis down"))
    mocks.readWindowStates.mockResolvedValue([])

    await expect(
      responseSlaService.trackWindow(
        { workspaceId: WS, conversationIds: ["c1"] },
        run,
      ),
    ).resolves.toBe("result")
  })

  test("an SLA failure leaves the window without a deadline but never fails the caller's write", async () => {
    mocks.readWindowStates
      .mockResolvedValueOnce([state()])
      .mockResolvedValueOnce([state({ awaitingHumanReplySince: since })])
    mocks.setSnapshotIfWindowUnchanged.mockRejectedValueOnce(new Error("boom"))

    await expect(
      responseSlaService.trackWindow(
        { workspaceId: WS, conversationIds: ["c1"], tx: client as never },
        run,
      ),
    ).resolves.toBe("result")
    expect(run).toHaveBeenCalledTimes(1)
  })
})
