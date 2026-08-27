import { beforeEach, describe, expect, test, vi } from "vitest"

// ── db spies ──────────────────────────────────────────────────────────────────
const findManyBroadcast = vi.fn()
const dbCountMock = vi.fn()
const returningSpy = vi.fn()
const recordAuditLog = vi.fn()

type UpdateCall = {
  table: unknown
  values: Record<string, unknown>
  condition: unknown
}
const updateCalls: UpdateCall[] = []

// ── distributed lock spy ──────────────────────────────────────────────────────
const runExclusiveSpy = vi.fn()

// ── logger spy ────────────────────────────────────────────────────────────────
const loggerInfoSpy = vi.fn()

// ── mocks ─────────────────────────────────────────────────────────────────────
vi.mock("@chatbotx.io/business/audit", () => ({
  auditService: { record: (...args: unknown[]) => recordAuditLog(...args) },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      broadcastModel: {
        findMany: (...args: unknown[]) => findManyBroadcast(...args),
      },
    },
    $count: (...args: unknown[]) => dbCountMock(...args),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: (condition: unknown) => {
          updateCalls.push({ table, values, condition })
          return Object.assign(Promise.resolve(), {
            returning: (...args: unknown[]) => returningSpy(...args),
          })
        },
      }),
    }),
  },
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  ne: (a: unknown, b: unknown) => ({ __ne: [a, b] }),
  or: (...args: unknown[]) => ({ __or: args }),
  isNotNull: (a: unknown) => ({ __isNotNull: a }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: { id: "broadcast.id", __name: "broadcastModel" },
  contactsOnBroadcastsModel: {
    broadcastId: "cob.broadcastId",
    deliveredAt: "cob.deliveredAt",
    failedAt: "cob.failedAt",
    __name: "contactsOnBroadcastsModel",
  },
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  broadcastStatuses: {
    enum: { scheduled: "scheduled", sending: "sending", sent: "sent" },
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  distributedLock: {
    runExclusive: (opts: {
      key: string
      timeoutInSeconds: number
      fn: () => Promise<unknown>
    }) => {
      runExclusiveSpy(opts)
      return opts.fn()
    },
  },
}))

vi.mock("../src/lib/logger", () => ({
  logger: {
    info: (...args: unknown[]) => loggerInfoSpy(...args),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const { finalizeBroadcasts } = await import(
  "../src/schedule/handlers/finalize-broadcasts"
)

// ── helpers ───────────────────────────────────────────────────────────────────
const makeBroadcast = (
  id: string,
  contactCount: number | null,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  name: "Broadcast",
  workspaceId: "workspace-1",
  status: "sending",
  contactCount,
  ...overrides,
})

// ── setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  updateCalls.length = 0
  findManyBroadcast.mockResolvedValue([])
  dbCountMock.mockResolvedValue(0)
  returningSpy.mockResolvedValue([{ id: "b-1" }])
  recordAuditLog.mockResolvedValue(undefined)
})

// ── tests ─────────────────────────────────────────────────────────────────────
describe("finalizeBroadcasts", () => {
  describe("distributed lock", () => {
    test("acquires lock with the expected key before executing", async () => {
      findManyBroadcast.mockResolvedValue([])

      await finalizeBroadcasts()

      expect(runExclusiveSpy).toHaveBeenCalledTimes(1)
      const [opts] = runExclusiveSpy.mock.calls[0] as [
        { key: string; timeoutInSeconds: number },
      ]
      expect(opts.key).toBe("schedule:finalize-broadcasts")
      expect(opts.timeoutInSeconds).toBe(55)
    })
  })

  describe("no 'sending' broadcasts", () => {
    test("returns { skipped: false, finalized: 0 } without any db updates", async () => {
      findManyBroadcast.mockResolvedValue([])

      const result = await finalizeBroadcasts()

      expect(result).toEqual({ skipped: false, finalized: 0 })
      expect(updateCalls).toHaveLength(0)
    })
  })

  describe("broadcast with null or zero contactCount", () => {
    test("skips broadcast with contactCount null", async () => {
      findManyBroadcast.mockResolvedValue([makeBroadcast("b-1", null)])

      const result = await finalizeBroadcasts()

      expect(result).toEqual({ skipped: false, finalized: 0 })
      expect(dbCountMock).not.toHaveBeenCalled()
      expect(updateCalls).toHaveLength(0)
    })

    test("skips broadcast with contactCount 0", async () => {
      findManyBroadcast.mockResolvedValue([makeBroadcast("b-1", 0)])

      const result = await finalizeBroadcasts()

      expect(result).toEqual({ skipped: false, finalized: 0 })
      expect(dbCountMock).not.toHaveBeenCalled()
    })
  })

  describe("broadcast is complete (completed >= total)", () => {
    test("updates broadcast status to 'sent' and increments finalized count", async () => {
      findManyBroadcast.mockResolvedValue([makeBroadcast("b-1", 10)])
      dbCountMock.mockResolvedValue(10) // completed === total

      const result = await finalizeBroadcasts()

      expect(result).toEqual({ skipped: false, finalized: 1 })
      expect(updateCalls).toHaveLength(1)
      expect(updateCalls[0].values).toMatchObject({ status: "sent" })
      expect(recordAuditLog).toHaveBeenCalledWith({
        action: "broadcast_sent",
        detail: "sent a broadcast (#b-1)",
        workspaceId: "workspace-1",
        source: "schedule:finalizeBroadcasts",
      })
    })

    test("does not emit broadcast_sent when process-broadcast-contacts already won the race (dedupe)", async () => {
      findManyBroadcast.mockResolvedValue([makeBroadcast("b-1", 10)])
      dbCountMock.mockResolvedValue(10)
      returningSpy.mockResolvedValue([])

      const result = await finalizeBroadcasts()

      expect(result).toEqual({ skipped: false, finalized: 1 })
      expect(recordAuditLog).not.toHaveBeenCalled()
    })

    test("completed > total also finalizes", async () => {
      findManyBroadcast.mockResolvedValue([makeBroadcast("b-1", 5)])
      dbCountMock.mockResolvedValue(7) // more completed than total (edge case)

      const result = await finalizeBroadcasts()

      expect(result).toEqual({ skipped: false, finalized: 1 })
    })
  })

  describe("broadcast is complete via missing threshold", () => {
    test("finalizes broadcast when missing contacts are within 1% and at most 100", async () => {
      // total = 20_000, completed = 19_900 -> missingCount = 100 (0.5%)
      findManyBroadcast.mockResolvedValue([makeBroadcast("b-1", 20_000)])
      dbCountMock.mockResolvedValue(19_900)

      const result = await finalizeBroadcasts()

      expect(result).toEqual({ skipped: false, finalized: 1 })
    })

    test("does not finalize when missing contacts are under 100 but over 1%", async () => {
      // total = 200, completed = 198 -> missingCount = 2 (1%)
      findManyBroadcast.mockResolvedValue([makeBroadcast("b-1", 200)])
      dbCountMock.mockResolvedValue(197)

      const result = await finalizeBroadcasts()

      expect(result).toEqual({ skipped: false, finalized: 0 })
      expect(updateCalls).toHaveLength(0)
    })

    test("does not finalize when missing contacts are over 100 even if under 1%", async () => {
      // total = 20_000, completed = 19_899 -> missingCount = 101 (0.505%)
      findManyBroadcast.mockResolvedValue([makeBroadcast("b-1", 20_000)])
      dbCountMock.mockResolvedValue(19_899)

      const result = await finalizeBroadcasts()

      expect(result).toEqual({ skipped: false, finalized: 0 })
      expect(updateCalls).toHaveLength(0)
    })
  })

  describe("multiple broadcasts in one pass", () => {
    test("finalizes completed broadcasts and skips incomplete ones", async () => {
      findManyBroadcast.mockResolvedValue([
        makeBroadcast("b-1", 10), // complete
        makeBroadcast("b-2", 500), // incomplete (too many missing)
        makeBroadcast("b-3", 50), // complete
      ])
      dbCountMock
        .mockResolvedValueOnce(10) // b-1: completed >= total
        .mockResolvedValueOnce(250) // b-2: 250 missing → not finalized
        .mockResolvedValueOnce(50) // b-3: completed >= total

      const result = await finalizeBroadcasts()

      expect(result).toEqual({ skipped: false, finalized: 2 })
      expect(updateCalls).toHaveLength(2)
    })
  })

  describe("$count query arguments", () => {
    test("counts contactsOnBroadcastsModel rows filtered by broadcastId and deliveredAt/failedAt", async () => {
      findManyBroadcast.mockResolvedValue([makeBroadcast("b-1", 5)])
      dbCountMock.mockResolvedValue(5)

      await finalizeBroadcasts()

      expect(dbCountMock).toHaveBeenCalledTimes(1)
      // First arg is the model table, second is the where condition
      const [table, where] = dbCountMock.mock.calls[0] as [
        { __name: string },
        { __and: unknown[] },
      ]
      expect(table.__name).toBe("contactsOnBroadcastsModel")
      expect(where.__and).toHaveLength(2)
    })
  })

  describe("logger output", () => {
    test("logs finalized count after completing the pass", async () => {
      findManyBroadcast.mockResolvedValue([makeBroadcast("b-1", 3)])
      dbCountMock.mockResolvedValue(3)

      await finalizeBroadcasts()

      expect(loggerInfoSpy).toHaveBeenCalledWith(
        expect.objectContaining({ finalized: 1 }),
        "finalizeBroadcasts completed",
      )
    })
  })
})
