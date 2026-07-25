import { beforeEach, describe, expect, test, vi } from "vitest"

// ── fixed "now" so startOfMinute is deterministic ─────────────────────────────
const FIXED_START = new Date("2026-01-01T10:00:00.000Z")

// ── db spy ────────────────────────────────────────────────────────────────────
const findManyBroadcast = vi.fn()

// ── queue spy ─────────────────────────────────────────────────────────────────
const addBulkSpy = vi.fn()

// ── mocks ─────────────────────────────────────────────────────────────────────
vi.mock("date-fns", () => ({
  startOfMinute: (_input: unknown) => FIXED_START,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      broadcastModel: {
        findMany: (...args: unknown[]) => findManyBroadcast(...args),
      },
    },
  },
}))

vi.mock("@chatbotx.io/worker-config", () => ({
  scheduleQueue: {
    addBulk: (...args: unknown[]) => addBulkSpy(...args),
  },
  ScheduleJobData: {
    sendBroadcast: "sendBroadcast",
    prepareBroadcast: "prepareBroadcast",
    enqueueBroadcast: "enqueueBroadcast",
    finalizeBroadcasts: "finalizeBroadcasts",
  },
}))

const { enqueueBroadcast } = await import(
  "../src/schedule/handlers/enqueue-broadcast"
)

// ── helpers ───────────────────────────────────────────────────────────────────
const makeBroadcasts = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `broadcast-${i + 1}`,
    status: "scheduled",
    schedulesAt: new Date("2026-01-01T09:59:00.000Z"),
  }))

// ── setup ─────────────────────────────────────────────────────────────────────
beforeEach(() => {
  findManyBroadcast.mockResolvedValue([])
  addBulkSpy.mockResolvedValue(undefined)
})

// ── tests ─────────────────────────────────────────────────────────────────────
describe("enqueueBroadcast", () => {
  describe("no scheduled broadcasts found", () => {
    test("returns { scanned: 0, enqueued: 0 } without calling addBulk", async () => {
      findManyBroadcast.mockResolvedValue([])

      const result = await enqueueBroadcast()

      expect(result).toEqual({ scanned: 0, enqueued: 0 })
      expect(addBulkSpy).not.toHaveBeenCalled()
    })
  })

  describe("broadcasts found within one bulk chunk (<= 500)", () => {
    test("calls addBulk once with prepareBroadcast jobs for each broadcast", async () => {
      const broadcasts = makeBroadcasts(3)
      findManyBroadcast.mockResolvedValue(broadcasts)

      const result = await enqueueBroadcast()

      expect(result).toEqual({ scanned: 3, enqueued: 3 })
      expect(addBulkSpy).toHaveBeenCalledTimes(1)

      const [jobs] = addBulkSpy.mock.calls[0] as [
        Array<{
          name: string
          data: { type: string; data: { broadcastId: string } }
          opts: { jobId: string }
        }>,
      ]
      expect(jobs).toHaveLength(3)
    })

    test("each job has name prepareBroadcast with correct broadcastId and dedup jobId", async () => {
      findManyBroadcast.mockResolvedValue(makeBroadcasts(1))

      await enqueueBroadcast()

      const [jobs] = addBulkSpy.mock.calls[0] as [
        Array<{
          name: string
          data: { type: string; data: { broadcastId: string } }
          opts: { jobId: string }
        }>,
      ]
      const job = jobs[0]
      expect(job.name).toBe("prepareBroadcast")
      expect(job.data.type).toBe("prepareBroadcast")
      expect(job.data.data.broadcastId).toBe("broadcast-1")
      expect(job.opts.jobId).toBe("schedule-prepare-broadcast-broadcast-1")
    })

    test("clears the dedup jobId on completion and on failure so a terminal job cannot wedge the broadcast forever", async () => {
      findManyBroadcast.mockResolvedValue(makeBroadcasts(1))

      await enqueueBroadcast()

      const [jobs] = addBulkSpy.mock.calls[0] as [
        Array<{
          opts: {
            jobId: string
            removeOnComplete?: boolean | number
            removeOnFail?: boolean | number
          }
        }>,
      ]
      // A deterministic jobId is a Redis dedup key that survives any terminal
      // state. Left behind after a failure it silently swallows every later
      // addBulk for the same broadcast.
      expect(jobs[0].opts.removeOnComplete).toBe(true)
      expect(jobs[0].opts.removeOnFail).toBe(true)
    })

    test("queries broadcastModel with status 'scheduled' and schedulesAt lte startTime", async () => {
      findManyBroadcast.mockResolvedValue(makeBroadcasts(1))

      await enqueueBroadcast()

      expect(findManyBroadcast).toHaveBeenCalledTimes(1)
      const [queryArg] = findManyBroadcast.mock.calls[0] as [
        { where: { status: string; schedulesAt: { lte: Date } } },
      ]
      expect(queryArg.where.status).toBe("scheduled")
      expect(queryArg.where.schedulesAt.lte).toEqual(FIXED_START)
    })
  })

  describe("more than 500 broadcasts (multi-chunk batching)", () => {
    test("splits into chunks of 500 and calls addBulk once per chunk", async () => {
      const broadcasts = makeBroadcasts(501)
      findManyBroadcast.mockResolvedValue(broadcasts)

      const result = await enqueueBroadcast()

      expect(result).toEqual({ scanned: 501, enqueued: 501 })
      expect(addBulkSpy).toHaveBeenCalledTimes(2)

      const [firstBatch] = addBulkSpy.mock.calls[0] as [unknown[]]
      const [secondBatch] = addBulkSpy.mock.calls[1] as [unknown[]]
      expect(firstBatch).toHaveLength(500)
      expect(secondBatch).toHaveLength(1)
    })

    test("exactly 1000 broadcasts → two equal batches of 500", async () => {
      findManyBroadcast.mockResolvedValue(makeBroadcasts(1000))

      const result = await enqueueBroadcast()

      expect(result).toEqual({ scanned: 1000, enqueued: 1000 })
      expect(addBulkSpy).toHaveBeenCalledTimes(2)
    })
  })
})
