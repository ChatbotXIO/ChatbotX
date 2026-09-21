/**
 * FAST, O(N) purge of pending `coexistAttachmentDownload` jobs from the `low`
 * queue by jobId prefix (`att-`), preserving avatars and every other job type.
 *
 * WHY (not delete:coexist-attachment): per-job `job.remove()` does an O(list)
 * LREM, so removing millions from a huge wait list is O(N²) and takes hours.
 * This rebuilds the wait list once (O(N)) and bulk-UNLINKs the deleted hashes.
 *
 * ⚠️ DESTRUCTIVE + requires a maintenance window:
 * - PAUSES the `low` queue while running (workers stop pulling; active finish),
 *   then RESUMES (always, even on error).
 * - The attachment PRODUCER must be OFF first, otherwise jobs pushed during the
 *   snapshot→swap window are lost (and the backlog refills anyway).
 * - Keeps every job whose id does NOT start with `att-` (avatars =
 *   `update-avatar-*`, plus any other type) — default-keep, so a mis-scan cannot
 *   silently drop non-attachment work. `active` jobs are never touched.
 *
 * RUN (host with worker env / REDIS_URL at the queue Redis):
 *   dry run:  pnpm --filter worker purge:attachment-low
 *   execute:  pnpm --filter worker purge:attachment-low -- --execute
 */
import { lowQueue } from "@chatbotx.io/worker-config"
import type { Queue } from "bullmq"
import { fastPurgeWaitingByPrefix } from "./migrate-coexist-jobs"

const EXECUTE = process.argv.includes("--execute")
const DELETE_PREFIX = "att-"

async function main(): Promise<void> {
  const queue = lowQueue as unknown as Queue

  console.log(
    EXECUTE
      ? "=== EXECUTE: fast-purging att-* (coexistAttachmentDownload) from low ==="
      : "=== DRY RUN (pass --execute to purge) ===",
  )
  console.log(
    "low counts before:",
    await queue.getJobCounts("waiting", "active"),
  )

  if (EXECUTE) {
    console.log("pausing low queue…")
    await queue.pause()
  }

  try {
    const stats = await fastPurgeWaitingByPrefix({
      queue,
      deletePrefix: DELETE_PREFIX,
      execute: EXECUTE,
      // pause() moved `wait` → `paused`; operate there so we actually see the
      // jobs. resume() moves the rebuilt list back to `wait`. (Dry run doesn't
      // pause, so it reads `wait`.)
      list: EXECUTE ? "paused" : "wait",
      onProgress: (s) => {
        if (s.scanned % 200_000 < 10_000) {
          console.log("progress:", s)
        }
      },
    })
    console.log("DONE:", stats)
  } finally {
    if (EXECUTE) {
      console.log("resuming low queue…")
      await queue.resume()
    }
  }

  console.log(
    "low counts after:",
    await queue.getJobCounts("waiting", "active"),
  )
}

main()
  .then(async () => {
    await lowQueue.close()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error(err)
    await lowQueue.close()
    process.exit(1)
  })
