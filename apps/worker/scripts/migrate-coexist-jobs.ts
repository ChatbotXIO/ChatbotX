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
  /** Jobs processed concurrently (default 100). Bounds in-flight Redis ops. */
  concurrency?: number
  onProgress?: (stats: MoveStats, processed: number) => void
}): Promise<MoveStats> {
  const { source, target, targetNames, ids, execute, onProgress } = params
  const concurrency = Math.max(1, Math.min(params.concurrency ?? 100, 1000))
  const stats = newStats()
  let cursor = 0
  let processed = 0

  const processOne = async (id: string): Promise<void> => {
    const job = await Job.fromId(source, id)
    if (!job) {
      stats.missing++
      return
    }
    if (!targetNames.has(job.name)) {
      stats.nonTarget++
      return
    }
    if ((await job.getState()) !== "waiting") {
      stats.notWaiting++
      return
    }
    if (!execute) {
      stats.moved++
      return
    }

    const destId = job.opts?.jobId ?? job.id
    if (destId) {
      const dest = await Job.fromId(target, destId)
      if (dest) {
        const destState = await dest.getState()
        if (destState === "completed") {
          await removeQuietly(job)
          stats.alreadyDone++
          return
        }
        if (destState === "failed") {
          await dest.remove() // clear terminal dup so the re-add is runnable
          stats.requeuedFailed++
        } else {
          // waiting / active / delayed runnable copy already on the target
          await removeQuietly(job)
          stats.dedupedRunnable++
          return
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
  }

  // Fixed-size worker pool: `concurrency` ids in flight at once. Each id is
  // independent, so parallelism does not affect correctness (still by-id, still
  // re-checks state) — it just keeps the Redis pipe busy for large backlogs.
  const runWorker = async (): Promise<void> => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= ids.length) {
        return
      }
      await processOne(ids[index])
      processed += 1
      if (processed % 10_000 === 0) {
        onProgress?.(stats, processed)
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, ids.length || 1) }, runWorker),
  )
  return stats
}

async function removeQuietly(job: Job): Promise<void> {
  try {
    await job.remove()
  } catch {
    // Locked by a worker — it will finish/clean up on its own.
  }
}

export type DeleteStats = {
  /** Jobs removed from the queue. */
  deleted: number
  /** Snapshotted id no longer present (already drained/removed). */
  missing: number
  /** Job left the `waiting` state (active/completed/failed/delayed) — left alone. */
  notWaiting: number
  /** Not one of the target names — left alone. */
  nonTarget: number
  /** Job locked by a worker mid-delete — left to finish where it is. */
  locked: number
}

/**
 * Permanently remove the `waiting` jobs whose id is in `ids` and whose `name` is
 * in `targetNames` from `queue`. DESTRUCTIVE — the work those jobs represent is
 * not done and not moved anywhere.
 *
 * Concurrency-safe against a live worker, mirroring moveWaitingTargetsToLow:
 * operates by id (stable snapshot), re-checks the job still exists and is still
 * `waiting`, and treats a `remove()` that throws (worker locked it) as skipped.
 * Only `waiting` jobs are touched; active/delayed/completed/failed are left alone.
 */
export async function deleteWaitingTargetsById(params: {
  queue: Queue
  targetNames: ReadonlySet<string>
  ids: readonly string[]
  execute: boolean
  concurrency?: number
  onProgress?: (stats: DeleteStats, processed: number) => void
}): Promise<DeleteStats> {
  const { queue, targetNames, ids, execute, onProgress } = params
  const concurrency = Math.max(1, Math.min(params.concurrency ?? 100, 1000))
  const stats: DeleteStats = {
    deleted: 0,
    missing: 0,
    notWaiting: 0,
    nonTarget: 0,
    locked: 0,
  }
  let cursor = 0
  let processed = 0

  const processOne = async (id: string): Promise<void> => {
    const job = await Job.fromId(queue, id)
    if (!job) {
      stats.missing++
      return
    }
    if (!targetNames.has(job.name)) {
      stats.nonTarget++
      return
    }
    if ((await job.getState()) !== "waiting") {
      stats.notWaiting++
      return
    }
    if (!execute) {
      stats.deleted++
      return
    }
    try {
      await job.remove()
      stats.deleted++
    } catch {
      stats.locked++
    }
  }

  const runWorker = async (): Promise<void> => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= ids.length) {
        return
      }
      await processOne(ids[index])
      processed += 1
      if (processed % 10_000 === 0) {
        onProgress?.(stats, processed)
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, ids.length || 1) }, runWorker),
  )
  return stats
}

export type PurgeStats = {
  scanned: number
  toDelete: number
  toKeep: number
  deletedHashes: number
}

/**
 * FAST, O(N) purge of `waiting` jobs whose jobId starts with `deletePrefix`
 * (e.g. "att-"), preserving every other waiting job. Built for queues far too
 * large for per-job `job.remove()` (whose LREM is O(list) → O(N²) at millions).
 *
 * MUST run with the queue PAUSED and the producer stopped: it snapshots the
 * stable `wait` list, rebuilds it into a temp key keeping only non-matching ids,
 * atomically RENAMEs it back, then UNLINKs the deleted jobs' hashes to reclaim
 * memory. Jobs pushed between the snapshot and the swap would be lost, which is
 * why the caller pauses the queue and confirms the producer is off first.
 *
 * Classification is by jobId prefix only (no hash reads), and it DEFAULT-KEEPS:
 * anything not matching `deletePrefix` (avatars, any other type) is preserved.
 * `active` jobs are not in the `wait` list, so they are never touched.
 */
export async function fastPurgeWaitingByPrefix(params: {
  queue: Queue
  deletePrefix: string
  execute: boolean
  /**
   * Which BullMQ list to operate on. Default `wait`. IMPORTANT: `Queue.pause()`
   * renames `wait` → `paused`, so a caller that pauses the queue first must pass
   * `list: "paused"` — otherwise this reads an empty `wait` list and purges
   * nothing. `resume()` moves `paused` back to `wait`.
   */
  list?: "wait" | "paused"
  chunk?: number
  onProgress?: (stats: PurgeStats) => void
}): Promise<PurgeStats> {
  const { queue, deletePrefix, execute, onProgress } = params
  const chunk = Math.max(1000, Math.min(params.chunk ?? 10_000, 100_000))
  const client = await queue.client
  const waitKey = queue.toKey(params.list ?? "wait")
  const rebuildKey = `${waitKey}:purge-rebuild`
  const stats: PurgeStats = {
    scanned: 0,
    toDelete: 0,
    toKeep: 0,
    deletedHashes: 0,
  }

  if (execute) {
    await client.del(rebuildKey) // clear any leftover from a prior run
  }

  // Stream the (paused, stable) wait list by offset; safe because nothing
  // mutates it while paused + producer off.
  let start = 0
  while (true) {
    const ids = await client.lrange(waitKey, start, start + chunk - 1)
    if (ids.length === 0) {
      break
    }
    const keep: string[] = []
    const del: string[] = []
    for (const id of ids) {
      stats.scanned++
      if (id.startsWith(deletePrefix)) {
        del.push(id)
      } else {
        keep.push(id)
      }
    }
    stats.toDelete += del.length
    stats.toKeep += keep.length

    if (execute) {
      if (keep.length > 0) {
        await client.rpush(rebuildKey, ...keep)
      }
      if (del.length > 0) {
        await client.unlink(...del.map((id) => queue.toKey(id)))
        stats.deletedHashes += del.length
      }
    }

    start += ids.length
    onProgress?.(stats)
  }

  if (execute) {
    // Atomically swap the rebuilt list in. If nothing was kept, just drop it.
    const rebuilt = await client.exists(rebuildKey)
    if (rebuilt) {
      await client.rename(rebuildKey, waitKey)
    } else {
      await client.del(waitKey)
    }
  }

  return stats
}
