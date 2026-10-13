import type { RecurrenceRule } from "@chatbotx.io/utils/recurrence"
import { beforeEach, describe, expect, test, vi } from "vitest"

const insertedRuns = vi.fn()
const insertReturning = vi.fn()
const templateUpdate = vi.fn()
const targetsFindMany = vi.fn()
const existingRunFindFirst = vi.fn()
const auditDispatch = vi.fn().mockResolvedValue(undefined)

const tx = {
  insert: () => ({
    values: (values: unknown) => {
      insertedRuns(values)
      return {
        onConflictDoNothing: () => ({ returning: () => insertReturning() }),
      }
    },
  }),
  update: () => ({
    set: (values: unknown) => ({
      where: () => {
        templateUpdate(values)
        return Promise.resolve()
      },
    }),
  }),
  query: {
    broadcastTargetModel: { findMany: targetsFindMany },
    broadcastModel: { findFirst: existingRunFindFirst },
  },
}

const repo = vi.hoisted(() => ({
  selectDbNow: vi.fn(),
  findForMaterialize: vi.fn(),
  findLedgerRow: vi.fn(),
  insertLedgerRows: vi.fn(),
  update: vi.fn(),
  insertIfMissing: vi.fn(),
  lockForWrite: vi.fn(),
  lockAllForWorkspace: vi.fn(),
  findByBroadcastId: vi.fn(),
  listLedgerBucketKeys: vi.fn(),
  listLedgerBucketCells: vi.fn(),
  listLedgerRows: vi.fn(),
  countLedgerSlots: vi.fn(),
  listDue: vi.fn(),
  findOldestDueAgeMs: vi.fn(),
}))
const findByIdOrName = vi.fn()
const getStatsByOccurrenceBucket = vi.fn()
const getBatchStats = vi.fn()
const copyTargetsSpy = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: { transaction: async (run: (t: typeof tx) => unknown) => await run(tx) },
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
}))
vi.mock("@chatbotx.io/database/repositories", () => ({
  broadcastRecurrenceRepository: repo,
  broadcastRepository: {
    findByIdOrName: (...a: unknown[]) => findByIdOrName(...a),
  },
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {
    id: "b.id",
    parentBroadcastId: "b.parentBroadcastId",
    occurrenceAt: "b.occurrenceAt",
  },
  broadcastTargetModel: {},
}))
vi.mock("@chatbotx.io/analytics", () => ({
  broadcastAnalyticsService: {
    getStatsByOccurrenceBucket: (...a: unknown[]) =>
      getStatsByOccurrenceBucket(...a),
    getBatchStats: (...a: unknown[]) => getBatchStats(...a),
  },
}))
vi.mock("../src/audit/dispatcher", () => ({
  dispatchAuditRecord: auditDispatch,
}))
vi.mock("../src/broadcast/derive", async () => {
  const actual = await vi.importActual<
    typeof import("../src/broadcast/derive")
  >("../src/broadcast/derive")
  return {
    ...actual,
    copyBroadcastTargets: (...a: unknown[]) => copyTargetsSpy(...a),
  }
})

const assertActivationAllowed = vi.fn()
const appliesToChannel = vi.fn(() => false)
const restrictionFor = vi.fn()
const resolveForWorkspace = vi.fn()
vi.mock("../src/broadcast/plan-policy.service", () => ({
  broadcastPlanPolicyService: {
    appliesToChannel: (...a: unknown[]) => appliesToChannel(...(a as [])),
    restrictionFor: (...a: unknown[]) => restrictionFor(...a),
    resolveForWorkspace: (...a: unknown[]) => resolveForWorkspace(...a),
    assertActivationAllowed: (...a: unknown[]) => assertActivationAllowed(...a),
  },
}))

const {
  broadcastRecurrenceService: service,
  groupLedgerCells,
  nextBucketStart,
} = await import("../src/broadcast/recurrence.service")
const {
  BROADCAST_PLAN_LIMIT_CODE,
  BroadcastValidationException,
  ChatbotXException,
} = await import("../src/errors")

const DAY = 86_400_000
const OCCURRENCE_CURSOR = /^\d+:902$/
const SLOT = new Date("2026-10-13T02:00:00.000Z") // 09:00 in Ho Chi Minh
const rule: RecurrenceRule = {
  frequency: "daily",
  interval: 1,
  timeOfDay: "09:00",
  timezone: "Asia/Ho_Chi_Minh",
  startsOn: "2026-10-01",
  end: { kind: "never" },
}

const makeRecurrence = (overrides: Record<string, unknown> = {}) => ({
  id: "r1",
  workspaceId: "w1",
  broadcastId: "t1",
  rule,
  nextRunAt: SLOT,
  accountedThroughAt: new Date(SLOT.getTime() - DAY),
  occurrenceCount: 0,
  lastOccurrenceAt: null,
  pausedAt: null,
  endedAt: null,
  ...overrides,
})
const makeTemplate = (overrides: Record<string, unknown> = {}) => ({
  id: "t1",
  workspaceId: "w1",
  name: "Daily promo",
  status: "recurring",
  schedulesType: "recurring",
  occurrenceAt: null,
  deletedAt: null,
  channel: "whatsapp",
  subaction: "sendMessage",
  flowId: "flow-1",
  templateId: null,
  templateData: null,
  integrationWhatsappId: null,
  integrationMessengerId: null,
  targetMode: "channel",
  contactFilter: null,
  sendRatePerMinute: null,
  audienceRangeStart: null,
  audienceRangeEnd: null,
  ...overrides,
})

const arrange = (input: {
  now?: Date
  recurrence?: Record<string, unknown>
  template?: Record<string, unknown>
}) => {
  repo.selectDbNow.mockResolvedValue(
    input.now ?? new Date(SLOT.getTime() + 5000),
  )
  repo.findForMaterialize.mockResolvedValue({
    recurrence: makeRecurrence(input.recurrence),
    template: makeTemplate(input.template),
  })
}

const ledgerCalls = () =>
  repo.insertLedgerRows.mock.calls.map(
    (call) => call[1] as Record<string, unknown>[],
  )

beforeEach(() => {
  vi.clearAllMocks()
  repo.update.mockResolvedValue(true)
  repo.insertLedgerRows.mockResolvedValue(undefined)
  repo.findLedgerRow.mockResolvedValue(null)
  insertReturning.mockResolvedValue([{ id: "run-1" }])
  targetsFindMany.mockResolvedValue([])
  appliesToChannel.mockReturnValue(false)
  assertActivationAllowed.mockResolvedValue({ sendRatePerMinute: 60 })
})

describe("materializeOccurrence", () => {
  test("creates a run for the due slot and advances the series in one transaction", async () => {
    arrange({})

    const result = await service.materializeOccurrence({
      recurrenceId: "r1",
      occurrenceAt: SLOT,
    })

    expect(result).toEqual({ createdBroadcastId: "run-1", seriesEnded: false })
    const run = insertedRuns.mock.calls[0][0]
    expect(run).toMatchObject({
      parentBroadcastId: "t1",
      status: "scheduled",
      schedulesType: "future",
      schedulesAt: SLOT,
      occurrenceAt: SLOT,
      flowId: "flow-1",
    })
    expect(run.name).toBe("Daily promo · 2026-10-13 09:00")
    expect(copyTargetsSpy).toHaveBeenCalledWith(tx, {
      sourceBroadcastId: "t1",
      broadcastId: "run-1",
    })
    expect(ledgerCalls().at(-1)).toEqual([
      expect.objectContaining({
        outcome: "created",
        reason: null,
        childBroadcastId: "run-1",
        localSlot: "2026-10-13 09:00",
      }),
    ])
    expect(repo.update).toHaveBeenCalledWith(tx, {
      id: "r1",
      expectedNextRunAt: SLOT,
      patch: expect.objectContaining({
        nextRunAt: new Date(SLOT.getTime() + DAY),
        occurrenceCount: 1,
        accountedThroughAt: SLOT,
      }),
    })
    expect(templateUpdate).toHaveBeenCalledWith({
      schedulesAt: new Date(SLOT.getTime() + DAY),
    })
    expect(auditDispatch).toHaveBeenCalledWith({
      action: "launch",
      detail: "launched a recurring broadcast run (#run-1)",
    })
  })

  test("after an outage only the latest slot is sent; every earlier one is accounted as missed", async () => {
    const now = new Date(SLOT.getTime() + 2 * DAY + 60_000)
    arrange({ now })

    const result = await service.materializeOccurrence({
      recurrenceId: "r1",
      occurrenceAt: SLOT,
    })

    const latest = new Date(SLOT.getTime() + 2 * DAY)
    expect(result.createdBroadcastId).toBe("run-1")
    expect(insertedRuns.mock.calls[0][0].occurrenceAt).toEqual(latest)
    const [missed, created] = ledgerCalls()
    expect(missed).toHaveLength(2)
    expect(missed.every((row) => row.outcome === "missed")).toBe(true)
    expect(missed.every((row) => row.reason === "catchUpSuperseded")).toBe(true)
    expect(missed.map((row) => row.localSlot)).toEqual([
      "2026-10-13 09:00",
      "2026-10-14 09:00",
    ])
    expect(created[0]).toMatchObject({
      outcome: "created",
      localSlot: "2026-10-15 09:00",
    })
  })

  test("a slot that is no longer the armed one is stale: nothing is created, and a settled run is reported", async () => {
    arrange({ recurrence: { nextRunAt: new Date(SLOT.getTime() + DAY) } })
    repo.findLedgerRow.mockResolvedValue({ childBroadcastId: "run-0" })

    const result = await service.materializeOccurrence({
      recurrenceId: "r1",
      occurrenceAt: SLOT,
    })

    expect(result).toEqual({
      createdBroadcastId: "run-0",
      seriesEnded: false,
      replayed: true,
    })
    expect(insertedRuns).not.toHaveBeenCalled()
    expect(repo.update).not.toHaveBeenCalled()
    // A replay is not a second launch.
    expect(auditDispatch).not.toHaveBeenCalled()
  })

  test("a replay after a catch-up finds the run that belongs to the later slot", async () => {
    arrange({
      recurrence: {
        nextRunAt: new Date(SLOT.getTime() + 3 * DAY),
        lastOccurrenceAt: new Date(SLOT.getTime() + 2 * DAY),
        occurrenceCount: 1,
      },
    })
    repo.findLedgerRow.mockImplementation(
      async (_tx: unknown, input: { localSlot: string }) =>
        input.localSlot === "2026-10-13 09:00"
          ? { outcome: "missed", childBroadcastId: null }
          : { outcome: "created", childBroadcastId: "run-late" },
    )

    const result = await service.materializeOccurrence({
      recurrenceId: "r1",
      occurrenceAt: SLOT,
    })

    expect(result.createdBroadcastId).toBe("run-late")
    expect(result.replayed).toBe(true)
    expect(auditDispatch).not.toHaveBeenCalled()
  })

  test("a replay of the last run reports that the series ended", async () => {
    arrange({
      recurrence: {
        nextRunAt: null,
        endedAt: new Date(SLOT.getTime() + 5000),
      },
    })
    repo.findLedgerRow.mockResolvedValue({ childBroadcastId: "run-1" })

    const result = await service.materializeOccurrence({
      recurrenceId: "r1",
      occurrenceAt: SLOT,
    })

    expect(result).toMatchObject({
      createdBroadcastId: "run-1",
      seriesEnded: true,
    })
  })

  test("a paused series or a draft template is disarmed, never sent", async () => {
    arrange({ template: { status: "cancelled" } })

    const result = await service.materializeOccurrence({
      recurrenceId: "r1",
      occurrenceAt: SLOT,
    })

    expect(result.createdBroadcastId).toBeNull()
    expect(insertedRuns).not.toHaveBeenCalled()
    expect(repo.update).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        id: "r1",
        patch: expect.objectContaining({ nextRunAt: null }),
      }),
    )
  })

  test("a missing series row creates nothing", async () => {
    repo.selectDbNow.mockResolvedValue(SLOT)
    repo.findForMaterialize.mockResolvedValue(null)
    expect(
      await service.materializeOccurrence({
        recurrenceId: "r1",
        occurrenceAt: SLOT,
      }),
    ).toEqual({ createdBroadcastId: null, seriesEnded: false })
  })

  test.each([
    [
      "targets mode with no page left",
      { targetMode: "targets", flowId: null },
      [],
      "noTargets",
    ],
    [
      "targets mode where no page can deliver",
      { targetMode: "targets", flowId: null },
      [{ flowId: null, templateId: null }],
      "undeliverable",
    ],
    [
      "channel mode without a flow or template",
      { flowId: null, templateId: null },
      [],
      "undeliverable",
    ],
    [
      "a template whose page was disconnected",
      {
        flowId: null,
        templateId: "tpl-1",
        integrationWhatsappId: null,
        integrationMessengerId: null,
      },
      [],
      "undeliverable",
    ],
  ])("%s is skipped with its reason and the series moves on", async (_label, template, targets, reason) => {
    arrange({ template })
    targetsFindMany.mockResolvedValue(targets)

    const result = await service.materializeOccurrence({
      recurrenceId: "r1",
      occurrenceAt: SLOT,
    })

    expect(result).toEqual({
      createdBroadcastId: null,
      seriesEnded: false,
      skipped: reason,
    })
    expect(insertedRuns).not.toHaveBeenCalled()
    expect(ledgerCalls().at(-1)?.[0]).toMatchObject({
      outcome: "skipped",
      reason,
    })
    // A skip does not use up the afterOccurrences budget but still advances.
    expect(repo.update).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        patch: expect.objectContaining({
          occurrenceCount: 0,
          nextRunAt: new Date(SLOT.getTime() + DAY),
        }),
      }),
    )
    expect(auditDispatch).not.toHaveBeenCalled()
  })

  describe("on a restricted plan", () => {
    const restriction = {
      policy: {
        kind: "restricted",
        maxSendRatePerMinute: 60,
        maxActiveBroadcasts: 1,
      },
      planName: "Trial",
    }
    beforeEach(() => {
      appliesToChannel.mockReturnValue(true)
      resolveForWorkspace.mockResolvedValue({ policy: restriction.policy })
      restrictionFor.mockReturnValue(restriction)
    })

    const activeBroadcastsLimit = () => {
      const error = new ChatbotXException(
        "full",
        BROADCAST_PLAN_LIMIT_CODE,
        403,
      )
      error.data = { reason: "activeBroadcasts" }
      return error
    }

    test("a full active slot is a planLimit skip decided BEFORE anything is inserted", async () => {
      arrange({})
      assertActivationAllowed.mockRejectedValue(activeBroadcastsLimit())

      const result = await service.materializeOccurrence({
        recurrenceId: "r1",
        occurrenceAt: SLOT,
      })

      expect(result.skipped).toBe("planLimit")
      expect(insertedRuns).not.toHaveBeenCalled()
      expect(copyTargetsSpy).not.toHaveBeenCalled()
      expect(ledgerCalls().at(-1)?.[0]).toMatchObject({
        outcome: "skipped",
        reason: "planLimit",
      })
    })

    test("the template rate is clamped to the plan's current cap and checks the slot", async () => {
      arrange({ template: { sendRatePerMinute: 500 } })

      await service.materializeOccurrence({
        recurrenceId: "r1",
        occurrenceAt: SLOT,
      })

      expect(assertActivationAllowed).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ sendRatePerMinute: 60, checkSlot: true }),
      )
      expect(insertedRuns.mock.calls[0][0].sendRatePerMinute).toBe(60)
    })

    test("any other plan error is not swallowed", async () => {
      arrange({})
      assertActivationAllowed.mockRejectedValue(new Error("db down"))

      await expect(
        service.materializeOccurrence({
          recurrenceId: "r1",
          occurrenceAt: SLOT,
        }),
      ).rejects.toThrow("db down")
      expect(insertedRuns).not.toHaveBeenCalled()
    })
  })

  test("an existing run for the same instant is reused instead of inserting a second one", async () => {
    arrange({})
    insertReturning.mockResolvedValue([])
    existingRunFindFirst.mockResolvedValue({ id: "run-existing" })

    const result = await service.materializeOccurrence({
      recurrenceId: "r1",
      occurrenceAt: SLOT,
    })

    expect(result.createdBroadcastId).toBe("run-existing")
    expect(copyTargetsSpy).not.toHaveBeenCalled()
  })

  test("the last allowed run ends the series and marks the template sent", async () => {
    arrange({
      recurrence: {
        rule: { ...rule, end: { kind: "afterOccurrences", count: 1 } },
      },
    })

    const result = await service.materializeOccurrence({
      recurrenceId: "r1",
      occurrenceAt: SLOT,
    })

    expect(result).toEqual({ createdBroadcastId: "run-1", seriesEnded: true })
    expect(repo.update).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        patch: expect.objectContaining({
          nextRunAt: null,
          occurrenceCount: 1,
          endedAt: expect.any(Date),
        }),
      }),
    )
    expect(templateUpdate).toHaveBeenCalledWith({
      schedulesAt: SLOT,
      status: "sent",
    })
  })

  test("a lost compare-and-set fails loudly so the transaction rolls back", async () => {
    arrange({})
    repo.update.mockResolvedValue(false)

    await expect(
      service.materializeOccurrence({ recurrenceId: "r1", occurrenceAt: SLOT }),
    ).rejects.toThrow("Recurrence moved while materializing")
  })
})

describe("skipOccurrence", () => {
  test("records a blocked owner's slot as skipped and advances without a run", async () => {
    arrange({})

    await service.skipOccurrence({
      recurrenceId: "r1",
      occurrenceAt: SLOT,
      reason: "blockedOwner",
    })

    expect(insertedRuns).not.toHaveBeenCalled()
    expect(ledgerCalls().at(-1)?.[0]).toMatchObject({
      outcome: "skipped",
      reason: "blockedOwner",
    })
    expect(repo.update).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ expectedNextRunAt: SLOT }),
    )
  })

  test("ignores a slot that is no longer armed", async () => {
    arrange({ recurrence: { nextRunAt: null } })
    await service.skipOccurrence({
      recurrenceId: "r1",
      occurrenceAt: SLOT,
      reason: "blockedOwner",
    })
    expect(repo.update).not.toHaveBeenCalled()
    expect(repo.insertLedgerRows).not.toHaveBeenCalled()
  })
})

describe("upsertRule", () => {
  test("canonicalizes the timezone, locks the series row and stores the rule", async () => {
    repo.lockForWrite.mockResolvedValue([makeRecurrence({ rule: undefined })])

    const stored = await service.upsertRule(tx as never, {
      workspaceId: "w1",
      broadcastId: "t1",
      rule: { ...rule, timezone: "Asia/Saigon" },
    })

    expect(stored.rule.timezone).toBe("Asia/Ho_Chi_Minh")
    expect(repo.insertIfMissing).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ broadcastId: "t1" }),
    )
    expect(repo.lockForWrite).toHaveBeenCalledWith(tx, {
      workspaceId: "w1",
      broadcastIds: ["t1"],
    })
    expect(repo.insertIfMissing.mock.invocationCallOrder[0]).toBeLessThan(
      repo.lockForWrite.mock.invocationCallOrder[0],
    )
  })

  test("rejects an invalid rule before touching the database", async () => {
    await expect(
      service.upsertRule(tx as never, {
        workspaceId: "w1",
        broadcastId: "t1",
        rule: { ...rule, timezone: "Mars/Olympus" },
      }),
    ).rejects.toThrow()
    expect(repo.insertIfMissing).not.toHaveBeenCalled()
  })
})

describe("arm", () => {
  const now = new Date("2026-10-16T05:00:00.000Z")

  test("accounts the slots that elapsed while it was off and computes the next run", async () => {
    const armed = await service.arm(tx as never, {
      recurrence: makeRecurrence({
        nextRunAt: null,
        pausedAt: new Date("2026-10-13T03:00:00.000Z"),
        accountedThroughAt: new Date("2026-10-13T03:00:00.000Z"),
      }) as never,
      workspaceId: "w1",
      channel: "whatsapp",
      sendRatePerMinute: null,
      restriction: null,
      now,
    })

    expect(armed.nextRunAt).toEqual(new Date("2026-10-17T02:00:00.000Z"))
    expect(ledgerCalls()[0].map((row) => row.localSlot)).toEqual([
      "2026-10-14 09:00",
      "2026-10-15 09:00",
      "2026-10-16 09:00",
    ])
    expect(ledgerCalls()[0].every((row) => row.reason === "paused")).toBe(true)
    expect(repo.update).toHaveBeenCalledWith(tx, {
      id: "r1",
      patch: expect.objectContaining({
        nextRunAt: armed.nextRunAt,
        accountedThroughAt: now,
        pausedAt: null,
        endedAt: null,
      }),
    })
  })

  test("a first activation has nothing to account", async () => {
    await service.arm(tx as never, {
      recurrence: makeRecurrence({
        nextRunAt: null,
        accountedThroughAt: null,
      }) as never,
      workspaceId: "w1",
      channel: "whatsapp",
      sendRatePerMinute: null,
      restriction: null,
      now,
    })
    expect(repo.insertLedgerRows).not.toHaveBeenCalled()
  })

  test("a series with no upcoming run is rejected as a recurrence validation error", async () => {
    await expect(
      service.arm(tx as never, {
        recurrence: makeRecurrence({
          rule: { ...rule, end: { kind: "onDate", date: "2026-10-01" } },
        }) as never,
        workspaceId: "w1",
        channel: "whatsapp",
        sendRatePerMinute: null,
        restriction: null,
        now,
      }),
    ).rejects.toMatchObject({
      name: "BroadcastValidationException",
      field: "recurrence",
      code: "validation",
    })
  })

  test("on a restricted channel the rate is checked WITHOUT taking an active slot", async () => {
    assertActivationAllowed.mockResolvedValue({ sendRatePerMinute: 60 })
    const restriction = { policy: {}, planName: null } as never

    const armed = await service.arm(tx as never, {
      recurrence: makeRecurrence({
        nextRunAt: null,
        accountedThroughAt: null,
      }) as never,
      workspaceId: "w1",
      channel: "messenger",
      sendRatePerMinute: 30,
      restriction,
      now,
    })

    expect(assertActivationAllowed).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        checkSlot: false,
        sendRatePerMinute: 30,
        restriction,
      }),
    )
    expect(armed.sendRateOverride).toEqual({ sendRatePerMinute: 60 })
  })
})

describe("previewUpcoming", () => {
  test("lists the next runs of a rule in its zone, capped, using the same maths as the schedule", () => {
    const preview = service.previewUpcoming({
      rule,
      count: 99,
      now: new Date("2026-10-13T00:00:00.000Z"),
    })
    expect(preview.upcomingRuns).toHaveLength(10)
    expect(preview.upcomingRuns[0]).toBe("2026-10-13T02:00:00.000Z")
    expect(preview.timezone).toBe("Asia/Ho_Chi_Minh")
    expect(preview.weekStartsOn).toBe("monday")
  })
})

describe("run groups", () => {
  const series = () => {
    findByIdOrName.mockResolvedValue({ id: "t1" })
    repo.findByBroadcastId.mockResolvedValue(
      makeRecurrence({ occurrenceCount: 4 }),
    )
  }

  test("groups the ledger so a day without a send is still a row, with its reason", async () => {
    series()
    // `limit + 1` keys come back: the extra one proves another page exists.
    repo.listLedgerBucketKeys.mockResolvedValue([
      "2026-10-14",
      "2026-10-13",
      "2026-10-12",
    ])
    repo.listLedgerBucketCells.mockResolvedValue([
      {
        bucket: "2026-10-14",
        outcome: "created",
        reason: null,
        runStatus: "sent",
        slots: 1,
      },
      {
        bucket: "2026-10-13",
        outcome: "missed",
        reason: "catchUpSuperseded",
        runStatus: null,
        slots: 1,
      },
    ])
    repo.countLedgerSlots.mockResolvedValue(2)
    const zero = { "message:sent": 0 }
    getStatsByOccurrenceBucket.mockResolvedValue({
      "2026-10-14": { "message:sent": 9 },
      "2026-10-13": zero,
    })

    const result = await service.listRunGroups({
      workspaceId: "w1",
      idOrName: "t1",
      granularity: "day",
      limit: 2,
    })

    expect(result.data).toHaveLength(2)
    expect(result.data[0]).toMatchObject({
      periodStart: "2026-10-14",
      periodEnd: "2026-10-15",
      slotCount: 1,
      createdCount: 1,
      runStateCounts: { sent: 1 },
      stats: { "message:sent": 9 },
    })
    expect(result.data[1]).toMatchObject({
      createdCount: 0,
      missedCount: 1,
      reasonCounts: { catchUpSuperseded: 1 },
    })
    expect(result.totalSlots).toBe(2)
    expect(result.totalRuns).toBe(4)
    expect(result.timezone).toBe("Asia/Ho_Chi_Minh")
    // A full page hands back a cursor; stats come from ONE bucketed call.
    expect(result.nextCursor).toBe("2026-10-13")
    expect(getStatsByOccurrenceBucket).toHaveBeenCalledTimes(1)
  })

  test("falls back to the rule's zone for an unknown timezone and caps the page size", async () => {
    series()
    repo.listLedgerBucketKeys.mockResolvedValue([])
    repo.listLedgerBucketCells.mockResolvedValue([])
    repo.countLedgerSlots.mockResolvedValue(0)
    getStatsByOccurrenceBucket.mockResolvedValue({})

    const result = await service.listRunGroups({
      workspaceId: "w1",
      idOrName: "t1",
      granularity: "week",
      timezone: "Not/AZone",
      limit: 500,
    })

    expect(result.timezone).toBe("Asia/Ho_Chi_Minh")
    expect(repo.listLedgerBucketKeys).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 32 }),
    )
    expect(result.nextCursor).toBeNull()
  })

  test("a series with exactly one page of groups offers no further page", async () => {
    series()
    repo.listLedgerBucketKeys.mockResolvedValue(["2026-10-14", "2026-10-13"])
    repo.listLedgerBucketCells.mockResolvedValue([])
    repo.countLedgerSlots.mockResolvedValue(0)
    getStatsByOccurrenceBucket.mockResolvedValue({})

    const result = await service.listRunGroups({
      workspaceId: "w1",
      idOrName: "t1",
      granularity: "day",
      limit: 2,
    })

    expect(result.data).toHaveLength(2)
    expect(result.nextCursor).toBeNull()
  })

  test("404s a broadcast that does not repeat", async () => {
    findByIdOrName.mockResolvedValue({ id: "t1" })
    repo.findByBroadcastId.mockResolvedValue(null)
    await expect(
      service.listRunGroups({
        workspaceId: "w1",
        idOrName: "t1",
        granularity: "day",
        limit: 5,
      }),
    ).rejects.toThrow("does not repeat")
    findByIdOrName.mockResolvedValue(null)
    await expect(
      service.listRunGroups({
        workspaceId: "w1",
        idOrName: "x",
        granularity: "day",
        limit: 5,
      }),
    ).rejects.toThrow("Broadcast not found")
  })

  test("period boundaries follow the grouping", () => {
    expect(nextBucketStart("2026-10-13", "day")).toBe("2026-10-14")
    expect(nextBucketStart("2026-10-12", "week")).toBe("2026-10-19")
    expect(nextBucketStart("2026-12-01", "month")).toBe("2027-01-01")
    expect(
      groupLedgerCells(["2026-10-13"], [], "day", "Asia/Ho_Chi_Minh"),
    ).toEqual([
      expect.objectContaining({ slotCount: 0, periodEnd: "2026-10-14" }),
    ])
  })

  test("a group carries its boundaries as instants in the group's zone, so a non-UTC series is windowed correctly", () => {
    // A 06:00 Ho Chi Minh slot is 23:00 UTC the day before: a UTC-midnight
    // window would put it in the wrong day.
    const [group] = groupLedgerCells(
      ["2026-10-13"],
      [],
      "day",
      "Asia/Ho_Chi_Minh",
    )
    expect(group.periodStartAt).toBe("2026-10-12T17:00:00.000Z")
    expect(group.periodEndAt).toBe("2026-10-13T17:00:00.000Z")
    const slot = Date.parse("2026-10-12T23:00:00.000Z") // 2026-10-13 06:00 local
    expect(slot).toBeGreaterThanOrEqual(Date.parse(group.periodStartAt))
    expect(slot).toBeLessThan(Date.parse(group.periodEndAt))

    const [week] = groupLedgerCells(["2026-10-12"], [], "week", "UTC")
    expect(week.periodEndAt).toBe("2026-10-19T00:00:00.000Z")
    const [month] = groupLedgerCells(
      ["2026-10-01"],
      [],
      "month",
      "America/New_York",
    )
    expect(month.periodStartAt).toBe("2026-10-01T04:00:00.000Z")
    expect(month.periodEndAt).toBe("2026-11-01T04:00:00.000Z")
  })
})

describe("listOccurrences", () => {
  const row = (
    id: string,
    at: string,
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    localSlot: at,
    occurrenceAt: new Date(`${at.replace(" ", "T")}:00Z`),
    outcome: "created",
    reason: null,
    materializedAt: new Date(`${at.replace(" ", "T")}:05Z`),
    supersededCount: 1,
    run: null,
    ...extra,
  })

  test("reports lateness, flags a stalled scheduled run, and pages with a cursor", async () => {
    findByIdOrName.mockResolvedValue({ id: "t1" })
    repo.findByBroadcastId.mockResolvedValue(makeRecurrence())
    repo.listLedgerRows.mockResolvedValue([
      row("903", "2020-01-03 02:00", {
        run: { id: "run-3", status: "scheduled", contactCount: null },
      }),
      row("902", "2020-01-02 02:00", {
        outcome: "missed",
        reason: "catchUpSuperseded",
      }),
      row("901", "2020-01-01 02:00"),
    ])
    getBatchStats.mockResolvedValue({ "run-3": { "message:sent": 0 } })

    const result = await service.listOccurrences({
      workspaceId: "w1",
      idOrName: "t1",
      limit: 2,
    })

    expect(result.data).toHaveLength(2)
    expect(result.data[0]).toMatchObject({
      latenessMs: 5000,
      run: { id: "run-3", isStalled: true, stats: { "message:sent": 0 } },
    })
    expect(result.data[1]).toMatchObject({ outcome: "missed", run: null })
    expect(getBatchStats).toHaveBeenCalledWith({
      workspaceId: "w1",
      broadcastIds: ["run-3"],
    })
    expect(result.nextCursor).toMatch(OCCURRENCE_CURSOR)
    expect(repo.listLedgerRows).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 3 }),
    )
  })

  test("does not ask for stats when no slot created a run, and rejects a bad cursor", async () => {
    findByIdOrName.mockResolvedValue({ id: "t1" })
    repo.findByBroadcastId.mockResolvedValue(makeRecurrence())
    repo.listLedgerRows.mockResolvedValue([])

    const result = await service.listOccurrences({
      workspaceId: "w1",
      idOrName: "t1",
      limit: 10,
    })
    expect(result).toEqual({ data: [], nextCursor: null })
    expect(getBatchStats).not.toHaveBeenCalled()

    for (const cursor of [
      "garbage",
      "1700000000000:abc",
      "abc:12",
      ":5",
      "1700000000000:",
    ]) {
      await expect(
        service.listOccurrences({
          workspaceId: "w1",
          idOrName: "t1",
          limit: 10,
          cursor,
        }),
      ).rejects.toMatchObject({ field: "cursor" })
    }
    expect(repo.listLedgerRows).not.toHaveBeenCalledWith(
      expect.objectContaining({ cursor: expect.anything() }),
    )
  })
})

describe("excluded dates", () => {
  const excluding = (...excludeDates: string[]) => ({
    rule: { ...rule, excludeDates },
  })

  test("a due slot on an excluded date is settled as skipped without touching capacity or targets", async () => {
    arrange({ recurrence: excluding("2026-10-13") })

    const result = await service.materializeOccurrence({
      recurrenceId: "r1",
      workspaceId: "w1",
      occurrenceAt: SLOT,
    })

    expect(result).toEqual({ createdBroadcastId: null, seriesEnded: false })
    expect(insertedRuns).not.toHaveBeenCalled()
    expect(targetsFindMany).not.toHaveBeenCalled()
    expect(assertActivationAllowed).not.toHaveBeenCalled()
    expect(ledgerCalls().at(-1)?.[0]).toMatchObject({
      outcome: "skipped",
      reason: "excludedDate",
      childBroadcastId: null,
      localSlot: "2026-10-13 09:00",
    })
    // The series moves on to the next slot and no run is counted.
    expect(repo.update).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        patch: expect.objectContaining({
          occurrenceCount: 0,
          nextRunAt: new Date(SLOT.getTime() + DAY),
        }),
      }),
    )
  })

  test("a skipped slot does not use up an afterOccurrences budget", async () => {
    arrange({
      recurrence: {
        rule: {
          ...rule,
          excludeDates: ["2026-10-13"],
          end: { kind: "afterOccurrences", count: 1 },
        },
      },
    })

    const result = await service.materializeOccurrence({
      recurrenceId: "r1",
      workspaceId: "w1",
      occurrenceAt: SLOT,
    })

    expect(result.seriesEnded).toBe(false)
    expect(repo.update).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        patch: expect.objectContaining({
          occurrenceCount: 0,
          nextRunAt: new Date(SLOT.getTime() + DAY),
        }),
      }),
    )
  })

  test("a series whose last slot is skipped ends after recording it", async () => {
    arrange({
      recurrence: {
        rule: {
          ...rule,
          excludeDates: ["2026-10-13"],
          end: { kind: "onDate", date: "2026-10-13" },
        },
      },
    })

    const result = await service.materializeOccurrence({
      recurrenceId: "r1",
      workspaceId: "w1",
      occurrenceAt: SLOT,
    })

    expect(result).toEqual({ createdBroadcastId: null, seriesEnded: true })
    expect(ledgerCalls().at(-1)?.[0]).toMatchObject({ reason: "excludedDate" })
    expect(templateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: "sent" }),
    )
  })

  test("after an outage a skipped latest slot sends nothing and earlier slots are superseded", async () => {
    arrange({
      now: new Date(SLOT.getTime() + 2 * DAY + 60_000),
      recurrence: excluding("2026-10-15"),
    })

    const result = await service.materializeOccurrence({
      recurrenceId: "r1",
      workspaceId: "w1",
      occurrenceAt: SLOT,
    })

    expect(result.createdBroadcastId).toBeNull()
    expect(insertedRuns).not.toHaveBeenCalled()
    const [missed, settled] = ledgerCalls()
    expect(missed.map((row) => row.reason)).toEqual([
      "catchUpSuperseded",
      "catchUpSuperseded",
    ])
    expect(settled[0]).toMatchObject({
      outcome: "skipped",
      reason: "excludedDate",
      localSlot: "2026-10-15 09:00",
    })
  })
})

describe("setOccurrenceExcluded", () => {
  const NOW = new Date(SLOT.getTime() + 5000)
  const call = (
    input: { date: string; excluded: boolean },
    state: {
      recurrence?: Record<string, unknown>
      template?: Record<string, unknown>
    } = {},
  ) => {
    const recurrence = makeRecurrence(state.recurrence)
    findByIdOrName.mockResolvedValue(makeTemplate(state.template))
    repo.findByBroadcastId.mockResolvedValue(recurrence)
    arrange({ now: NOW, ...state })
    return service.setOccurrenceExcluded({
      workspaceId: "w1",
      idOrName: "t1",
      ...input,
    })
  }
  const patchedDates = () =>
    (repo.update.mock.calls.at(-1)?.[1].patch.rule as RecurrenceRule)
      .excludeDates

  test("skips a future run: only the rule changes, never the cursor", async () => {
    const state = await call({ date: "2026-10-15", excluded: true })

    expect(repo.update).toHaveBeenCalledTimes(1)
    expect(repo.update.mock.calls[0][1]).toEqual({
      id: "r1",
      patch: { rule: { ...rule, excludeDates: ["2026-10-15"] } },
    })
    expect(state.excludeDates).toEqual(["2026-10-15"])
    expect(state.nextSendAt).toEqual(SLOT)
    expect(auditDispatch).toHaveBeenCalledWith({
      action: "update",
      detail: expect.stringContaining("2026-10-15"),
    })
  })

  test("locks the series before the template, through the shared helper", async () => {
    await call({ date: "2026-10-15", excluded: true })

    expect(repo.findForMaterialize).toHaveBeenCalledWith(tx, {
      recurrenceId: "r1",
      workspaceId: "w1",
    })
  })

  test("the next real send moves past a skipped armed slot", async () => {
    const state = await call(
      { date: "2026-10-14", excluded: true },
      { recurrence: { rule: { ...rule, excludeDates: ["2026-10-13"] } } },
    )

    expect(patchedDates()).toEqual(["2026-10-13", "2026-10-14"])
    expect(state.nextSendAt).toEqual(new Date(SLOT.getTime() + 2 * DAY))
  })

  test("restoring removes the date", async () => {
    const state = await call(
      { date: "2026-10-15", excluded: false },
      {
        recurrence: {
          rule: { ...rule, excludeDates: ["2026-10-15", "2026-10-20"] },
        },
      },
    )

    expect(patchedDates()).toEqual(["2026-10-20"])
    expect(state.excludeDates).toEqual(["2026-10-20"])
  })

  test("restoring the last date clears the list", async () => {
    await call(
      { date: "2026-10-15", excluded: false },
      { recurrence: { rule: { ...rule, excludeDates: ["2026-10-15"] } } },
    )

    expect(patchedDates()).toBeUndefined()
  })

  test.each([
    ["skipping a date that is already skipped", true, ["2026-10-15"]],
    ["restoring a date that is not skipped", false, ["2026-10-20"]],
  ])("%s changes nothing", async (_label, excluded, excludeDates) => {
    const state = await call(
      { date: "2026-10-15", excluded },
      { recurrence: { rule: { ...rule, excludeDates } } },
    )

    expect(repo.update).not.toHaveBeenCalled()
    expect(auditDispatch).not.toHaveBeenCalled()
    expect(state.excludeDates).toEqual(excludeDates)
  })

  test("rejects a date the schedule has no run on", async () => {
    const weeklyMondays: RecurrenceRule = {
      ...rule,
      frequency: "weekly",
      weekdays: [1],
      startsOn: "2026-10-05",
    }

    await expect(
      call(
        { date: "2026-10-20", excluded: true }, // a Tuesday
        { recurrence: { rule: weeklyMondays } },
      ),
    ).rejects.toBeInstanceOf(BroadcastValidationException)
    expect(repo.update).not.toHaveBeenCalled()
  })

  test("a leftover date that no longer matches a run can still be removed", async () => {
    const weeklyMondays: RecurrenceRule = {
      ...rule,
      frequency: "weekly",
      weekdays: [1],
      startsOn: "2026-10-05",
      excludeDates: ["2026-10-20"],
    }

    await call(
      { date: "2026-10-20", excluded: false },
      { recurrence: { rule: weeklyMondays } },
    )

    expect(patchedDates()).toBeUndefined()
  })

  test.each([
    ["a run that is due now", "2026-10-13", {}],
    [
      "a run the series already settled",
      "2026-10-14",
      { accountedThroughAt: new Date(SLOT.getTime() + 2 * DAY) },
    ],
  ])("rejects %s", async (_label, date, recurrence) => {
    await expect(
      call({ date, excluded: true }, { recurrence }),
    ).rejects.toBeInstanceOf(BroadcastValidationException)
    expect(repo.update).not.toHaveBeenCalled()
  })

  test.each([
    ["a finished series", { recurrence: { endedAt: SLOT } }],
    ["a draft", { template: { status: "draft" } }],
    ["a deleted broadcast", { template: { deletedAt: SLOT } }],
    [
      "a run of a series",
      { template: { occurrenceAt: SLOT, parentBroadcastId: "t0" } },
    ],
  ])("rejects %s", async (_label, state) => {
    await expect(
      call({ date: "2026-10-15", excluded: true }, state),
    ).rejects.toBeInstanceOf(BroadcastValidationException)
  })

  test("works on a paused series", async () => {
    await call(
      { date: "2026-10-15", excluded: true },
      {
        recurrence: { nextRunAt: null, pausedAt: SLOT },
        template: { status: "cancelled" },
      },
    )

    expect(patchedDates()).toEqual(["2026-10-15"])
  })

  test("drops dates the series already passed so the list stays small", async () => {
    await call(
      { date: "2026-10-25", excluded: true },
      {
        recurrence: {
          rule: { ...rule, excludeDates: ["2026-10-01", "2026-10-20"] },
        },
      },
    )

    expect(patchedDates()).toEqual(["2026-10-20", "2026-10-25"])
  })

  test("refuses to grow past the cap", async () => {
    const full = Array.from({ length: 366 }, (_, index) =>
      new Date(Date.UTC(2027, 0, 1 + index)).toISOString().slice(0, 10),
    )

    await expect(
      call(
        { date: "2026-10-15", excluded: true },
        { recurrence: { rule: { ...rule, excludeDates: full } } },
      ),
    ).rejects.toBeInstanceOf(BroadcastValidationException)
  })

  test("a missing broadcast is a not-found, not a silent no-op", async () => {
    findByIdOrName.mockResolvedValue(null)

    await expect(
      service.setOccurrenceExcluded({
        workspaceId: "w1",
        idOrName: "nope",
        date: "2026-10-15",
        excluded: true,
      }),
    ).rejects.toBeInstanceOf(ChatbotXException)
  })
})

describe("nextSendAtOf", () => {
  test("is the armed slot, or the first slot after skipped dates", () => {
    const base = { occurrenceCount: 0, nextRunAt: SLOT }
    expect(service.nextSendAtOf({ ...base, rule })).toEqual(SLOT)
    expect(
      service.nextSendAtOf({
        ...base,
        rule: { ...rule, excludeDates: ["2026-10-13", "2026-10-14"] },
      }),
    ).toEqual(new Date(SLOT.getTime() + 2 * DAY))
  })

  test("is null for a paused series and when only skipped dates remain", () => {
    expect(
      service.nextSendAtOf({ rule, occurrenceCount: 0, nextRunAt: null }),
    ).toBeNull()
    expect(
      service.nextSendAtOf({
        occurrenceCount: 0,
        nextRunAt: SLOT,
        rule: {
          ...rule,
          excludeDates: ["2026-10-13"],
          end: { kind: "onDate", date: "2026-10-13" },
        },
      }),
    ).toBeNull()
  })
})

describe("previewUpcoming with skipped dates", () => {
  test("lists only the runs that send and tolerates duplicate dates", () => {
    const preview = service.previewUpcoming({
      rule: { ...rule, excludeDates: ["2026-10-14", "2026-10-14"] },
      count: 3,
      now: new Date(SLOT.getTime() - 1000),
    })

    expect(preview.upcomingRuns).toEqual([
      SLOT.toISOString(),
      new Date(SLOT.getTime() + 2 * DAY).toISOString(),
      new Date(SLOT.getTime() + 3 * DAY).toISOString(),
    ])
  })
})
