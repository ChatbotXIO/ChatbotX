import { beforeEach, describe, expect, test, vi } from "vitest"

const materializeOccurrence = vi.fn()
const skipOccurrence = vi.fn()
const isBlockedWorkspace = vi.fn()
const queueAdd = vi.fn()
const auditContext = vi.fn()
const warn = vi.fn()
const error = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  broadcastRecurrenceService: {
    materializeOccurrence: (...a: unknown[]) => materializeOccurrence(...a),
    skipOccurrence: (...a: unknown[]) => skipOccurrence(...a),
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  MATERIALIZE_ITEM_CONCURRENCY: 3,
  ScheduleJobData: { prepareBroadcast: "prepareBroadcast" },
  scheduleQueue: { add: (...a: unknown[]) => queueAdd(...a) },
  broadcastPrepareJobId: (id: string) => `schedule-prepare-broadcast-${id}`,
}))
vi.mock("../src/lib/is-blocked-workspace", () => ({
  isBlockedWorkspace: (...a: unknown[]) => isBlockedWorkspace(...a),
}))
vi.mock("../src/lib/logger", () => ({
  logger: {
    warn: (...a: unknown[]) => warn(...a),
    error: (...a: unknown[]) => error(...a),
  },
}))
vi.mock("../src/lib/run-job-with-audit-context", () => ({
  runJobWithAuditContext: async (
    params: unknown,
    fn: () => Promise<unknown>,
  ) => {
    auditContext(params)
    return await fn()
  },
}))

const { materializeRecurringBroadcasts } = await import(
  "../src/broadcast-recurrence/handlers/materialize-recurring-broadcasts"
)

const SLOT_MS = Date.parse("2026-10-13T02:00:00.000Z")
const item = (id: string, workspaceId = "w1") => ({
  recurrenceId: id,
  workspaceId,
  occurrenceAtMs: SLOT_MS,
})

beforeEach(() => {
  vi.clearAllMocks()
  isBlockedWorkspace.mockResolvedValue(false)
  materializeOccurrence.mockResolvedValue({
    createdBroadcastId: null,
    seriesEnded: false,
  })
  skipOccurrence.mockResolvedValue(undefined)
  queueAdd.mockResolvedValue(undefined)
})

describe("materializeRecurringBroadcasts", () => {
  test("materializes each slot under its own workspace's audit context", async () => {
    await materializeRecurringBroadcasts([item("r1", "w1"), item("r2", "w2")])

    // The series must belong to the workspace the owner guard checked.
    expect(materializeOccurrence).toHaveBeenCalledWith({
      recurrenceId: "r1",
      workspaceId: "w1",
      occurrenceAt: new Date(SLOT_MS),
    })
    expect(auditContext).toHaveBeenCalledWith({
      workspaceId: "w2",
      source: "broadcastRecurrence:materialize",
    })
  })

  test("prepares a created run right away with the id the schedule tick uses", async () => {
    materializeOccurrence.mockResolvedValue({
      createdBroadcastId: "run-1",
      seriesEnded: false,
    })

    await materializeRecurringBroadcasts([item("r1")])

    expect(queueAdd).toHaveBeenCalledWith(
      "prepareBroadcast",
      { type: "prepareBroadcast", data: { broadcastId: "run-1" } },
      {
        jobId: "schedule-prepare-broadcast-run-1",
        removeOnComplete: true,
        removeOnFail: true,
      },
    )
  })

  test("prepares the final run of a series too", async () => {
    materializeOccurrence.mockResolvedValue({
      createdBroadcastId: "run-last",
      seriesEnded: true,
    })
    await materializeRecurringBroadcasts([item("r1")])
    expect(queueAdd).toHaveBeenCalledTimes(1)
  })

  test("prepares nothing for a skipped, stale or empty slot", async () => {
    materializeOccurrence
      .mockResolvedValueOnce({
        createdBroadcastId: null,
        seriesEnded: false,
        skipped: "planLimit",
      })
      .mockResolvedValueOnce({ createdBroadcastId: null, seriesEnded: false })
    await materializeRecurringBroadcasts([item("r1"), item("r2")])
    expect(queueAdd).not.toHaveBeenCalled()
  })

  test("a blocked owner's slot is skipped and the series moves on, never materialized", async () => {
    isBlockedWorkspace.mockResolvedValue(true)

    await materializeRecurringBroadcasts([item("r1")])

    expect(skipOccurrence).toHaveBeenCalledWith({
      recurrenceId: "r1",
      workspaceId: "w1",
      occurrenceAt: new Date(SLOT_MS),
      reason: "blockedOwner",
    })
    expect(materializeOccurrence).not.toHaveBeenCalled()
    expect(queueAdd).not.toHaveBeenCalled()
  })

  test("a failed prepare enqueue is logged, not thrown: the run is committed and the tick is the fallback", async () => {
    materializeOccurrence.mockResolvedValue({
      createdBroadcastId: "run-1",
      seriesEnded: false,
    })
    queueAdd.mockRejectedValue(new Error("redis down"))

    await expect(
      materializeRecurringBroadcasts([item("r1")]),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })

  test("one failing series does not stop the others, and the job fails afterwards so it is retried", async () => {
    materializeOccurrence
      .mockResolvedValueOnce({
        createdBroadcastId: "run-1",
        seriesEnded: false,
      })
      .mockRejectedValueOnce(new Error("deadlock"))
      .mockResolvedValueOnce({
        createdBroadcastId: "run-3",
        seriesEnded: false,
      })

    await expect(
      materializeRecurringBroadcasts([item("r1"), item("r2"), item("r3")]),
    ).rejects.toThrow("1 of 3 recurring broadcast slots failed")

    expect(materializeOccurrence).toHaveBeenCalledTimes(3)
    expect(queueAdd).toHaveBeenCalledTimes(2)
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ recurrenceId: "r2" }),
      expect.any(String),
    )
  })

  test("an empty batch is a no-op", async () => {
    await expect(materializeRecurringBroadcasts([])).resolves.toBeUndefined()
    expect(materializeOccurrence).not.toHaveBeenCalled()
  })

  test("a thrown blocked-owner check is a per-series failure, not a skip", async () => {
    isBlockedWorkspace.mockRejectedValue(new Error("db down"))
    await expect(materializeRecurringBroadcasts([item("r1")])).rejects.toThrow()
    expect(skipOccurrence).not.toHaveBeenCalled()
    expect(materializeOccurrence).not.toHaveBeenCalled()
  })
})
