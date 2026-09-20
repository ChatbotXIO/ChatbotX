import { Job, type JobsOptions, type Queue } from "bullmq"

export type MoveStats = {
  /** Jobs re-enqueued onto the target and removed from the source. */
  moved: number
  /** Snapshotted id no longer on the source (already drained by a worker). */
  missing: number
  /** Job left the `waiting` state (active/completed/failed/delayed) — left alone. */
  notWaiting: number
  /** Not one of the target names — left alone. */
  nonTarget: number
  /** Target already had a runnable job on the destination — source removed (dedup). */
  dedupedRunnable: number
  /** Target already completed on the destination — source removed, no re-add. */
  alreadyDone: number
  /** A retained *failed* destination dup was cleared before re-adding a runnable job. */
  requeuedFailed: number
  /** Source job locked by a worker mid-move — left to finish where it is. */
  locked: number
}

function newStats(): MoveStats {
  return {
    moved: 0,
    missing: 0,
    notWaiting: 0,
    nonTarget: 0,
    dedupedRunnable: 0,
    alreadyDone: 0,
    requeuedFailed: 0,
    locked: 0,
  }
}

/** Preserve the dedup id and retry/retention policy of the original job. */
function carryOverOpts(job: Job): JobsOptions {
  const opts = job.opts ?? {}
  return {
    jobId: opts.jobId ?? job.id,
    attempts: opts.attempts,
    backoff: opts.backoff,
    removeOnComplete: opts.removeOnComplete,
    removeOnFail: opts.removeOnFail,
  }
}

/**
 * Immutable snapshot of the source queue's `wait` list, ids only. Taking ids up
 * front (not offset-paginating a list a live worker is mutating) is what keeps
 * the migration from silently skipping jobs — we then operate by id, which is
 * stable regardless of how the list shifts underneath us.
 */
export async function snapshotWaitingIds(queue: Queue): Promise<string[]> {
  const client = await queue.client
  return client.lrange(queue.toKey("wait"), 0, -1)
}

/**
 * Move the `waiting` jobs whose id is in `ids` and whose `name` is in
 * `targetNames` from `source` to `target`, preserving name/data/jobId.
 *
 * Concurrency-safe against the live source worker:
 * - operates by id (stable), never by list offset;
 * - re-checks the job still exists and is still `waiting` at move time — a job a
 *   worker already grabbed (active) / finished (completed/failed) / delayed is
 *   left where it is;
 * - a `remove()` that throws because a worker locked the job mid-move is counted
 *   and skipped.
 *
 * Destination safety (avoids the retained-terminal-dup data-loss trap): if the
 * destination already holds this id, the source is only removed once a *runnable*
 * destination job is guaranteed — a `completed` dup means the work is done (drop
 * the source), a `failed` dup is cleared so the re-add is runnable, and a
 * waiting/active/delayed dup is treated as the moved copy (drop the source).
 *
 * NOTE: at-least-once, not exactly-once. If the source worker is processing the
 * same job concurrently, both may run; the avatar handler is safe
 * (`setAvatarIfEmpty`), while a racing attachment download can leave one
 * orphaned S3 object — the same tradeoff as the two-phase cutover. Delayed
 * (retry-backoff) jobs are deliberately NOT moved: re-adding them would reset the
 * remaining delay and retry budget, so they finish on the source instead.
 */
export async function moveWaitingTargetsToLow(params: {
  source: Queue
  target: Queue
  targetNames: ReadonlySet<string>
  ids: readonly string[]
  execute: boolean
  onProgress?: (stats: MoveStats) => void
}): Promise<MoveStats> {
  const { source, target, targetNames, ids, execute, onProgress } = params
  const stats = newStats()

  for (const id of ids) {
    const job = await Job.fromId(source, id)
    if (!job) {
      stats.missing++
      continue
    }
    if (!targetNames.has(job.name)) {
      stats.nonTarget++
      continue
    }
    if ((await job.getState()) !== "waiting") {
      stats.notWaiting++
      continue
    }
    if (!execute) {
      stats.moved++
      continue
    }

    const destId = job.opts?.jobId ?? job.id
    if (destId) {
      const dest = await Job.fromId(target, destId)
      if (dest) {
        const destState = await dest.getState()
        if (destState === "completed") {
          await removeQuietly(job)
          stats.alreadyDone++
          continue
        }
        if (destState === "failed") {
          await dest.remove() // clear terminal dup so the re-add is runnable
          stats.requeuedFailed++
        } else {
          // waiting / active / delayed runnable copy already on the target
          await removeQuietly(job)
          stats.dedupedRunnable++
          continue
        }
      }
    }

    try {
      await target.add(job.name, job.data, carryOverOpts(job))
      await job.remove()
      stats.moved++
    } catch {
      // Worker locked the job between getState and remove — safe to leave.
      stats.locked++
    }
    onProgress?.(stats)
  }

  return stats
}

async function removeQuietly(job: Job): Promise<void> {
  try {
    await job.remove()
  } catch {
    // Locked by a worker — it will finish/clean up on its own.
  }
}
