/**
 * Schedules per-workspace presence reports against a shared concurrency cap.
 *
 * Replaces a serial sweep that awaited each chunk of workspaces as a whole: one
 * slow builder response (up to the 5s report timeout) held back its entire
 * chunk and, through an overlap guard, the next sweep, so healthy workspaces
 * could outlive `PRESENCE_TTL_MS` and read as offline. Here a slow report only
 * occupies one slot, and a workspace that is already being reported is never
 * reported twice at once.
 *
 * State is bounded by the number of currently connected workspaces: every set
 * and map is drained as reports finish or pruned on the next sweep.
 */

export type PresenceReporterOptions = {
  concurrency: number
  getConnectedWorkspaceIds: () => Iterable<string>
  getUserIds: (workspaceId: string) => string[]
  now?: () => number
  onError?: (error: unknown, workspaceId: string) => void
  /** Resolves `true` when the lease was renewed, `false` when the report failed. */
  report: (workspaceId: string, userIds: string[]) => Promise<boolean>
}

export type PresenceReporter = {
  /** Queues a membership change ahead of any pending periodic reports. */
  reportNow: (workspaceId: string) => void
  stop: () => void
  /** Queues every connected workspace, longest-unreported first. */
  sweep: () => void
}

export const createPresenceReporter = ({
  concurrency,
  getConnectedWorkspaceIds,
  getUserIds,
  now = Date.now,
  onError,
  report,
}: PresenceReporterOptions): PresenceReporter => {
  // Insertion-ordered sets: a workspace is in at most one queue, so promoting
  // it moves it instead of leaving a stale copy behind, and the queues can
  // never hold more entries than there are connected workspaces.
  const priorityQueue = new Set<string>()
  const sweepQueue = new Set<string>()
  const inFlight = new Set<string>()
  const rerunAfterFlight = new Set<string>()
  const lastReportedAt = new Map<string, number>()
  let activeReports = 0
  let stopped = false

  const takeNext = (): string | undefined => {
    const queue = priorityQueue.size > 0 ? priorityQueue : sweepQueue
    const [workspaceId] = queue
    if (workspaceId !== undefined) {
      queue.delete(workspaceId)
    }
    return workspaceId
  }

  const enqueue = (workspaceId: string, isPriority: boolean): void => {
    if (stopped) {
      return
    }
    if (inFlight.has(workspaceId)) {
      // The running report may predate this membership change.
      if (isPriority) {
        rerunAfterFlight.add(workspaceId)
      }
      return
    }
    if (isPriority) {
      sweepQueue.delete(workspaceId)
      priorityQueue.add(workspaceId)
      return
    }
    if (!priorityQueue.has(workspaceId)) {
      sweepQueue.add(workspaceId)
    }
  }

  const runReport = async (
    workspaceId: string,
    userIds: string[],
  ): Promise<void> => {
    inFlight.add(workspaceId)
    try {
      // Only a renewed lease counts as fresh: a failed report must leave the
      // workspace among the stalest so the next sweep retries it first.
      if (await report(workspaceId, userIds)) {
        lastReportedAt.set(workspaceId, now())
      }
    } catch (error) {
      onError?.(error, workspaceId)
    } finally {
      inFlight.delete(workspaceId)
      activeReports -= 1
      if (rerunAfterFlight.delete(workspaceId)) {
        enqueue(workspaceId, true)
      }
      pump()
    }
  }

  function pump(): void {
    while (!stopped && activeReports < concurrency) {
      const workspaceId = takeNext()
      if (workspaceId === undefined) {
        return
      }
      const userIds = getUserIds(workspaceId)
      if (userIds.length === 0) {
        // Skipped here, not inside `runReport`: its `finally` re-enters `pump`
        // synchronously for a report that never awaits, so a backlog of
        // disconnected workspaces would recurse once per id.
        lastReportedAt.delete(workspaceId)
        continue
      }
      activeReports += 1
      // Not awaited: `runReport` handles its own errors and re-enters `pump`.
      runReport(workspaceId, userIds)
    }
  }

  return {
    reportNow: (workspaceId) => {
      enqueue(workspaceId, true)
      pump()
    },
    stop: () => {
      stopped = true
      priorityQueue.clear()
      sweepQueue.clear()
      rerunAfterFlight.clear()
      lastReportedAt.clear()
    },
    sweep: () => {
      // Re-queue from scratch so a backlog left by the previous sweep is
      // re-ordered stalest-first too, and workspaces that disconnected drop out.
      sweepQueue.clear()
      const connected = new Set(getConnectedWorkspaceIds())
      for (const workspaceId of lastReportedAt.keys()) {
        if (!connected.has(workspaceId)) {
          lastReportedAt.delete(workspaceId)
        }
      }
      const stalestFirst = [...connected].sort(
        (left, right) =>
          (lastReportedAt.get(left) ?? 0) - (lastReportedAt.get(right) ?? 0),
      )
      for (const workspaceId of stalestFirst) {
        enqueue(workspaceId, false)
      }
      pump()
    },
  }
}
