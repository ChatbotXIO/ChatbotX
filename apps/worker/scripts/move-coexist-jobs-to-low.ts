/**
 * One-off migration: move pending `coexistAttachmentDownload` and
 * `updateContactAvatar` jobs from the latency-sensitive `integration` queue to
 * the dedicated low-priority `low` queue.
 *
 * WHY: the two-phase cutover routes NEW jobs to `low`, but jobs enqueued before
 * the producer was updated stay on `integration` (drained by the double-handle
 * cases). With a large backlog that keeps loading `integration`, this relocates
 * the pending ones so the dedicated batch-low pool does the work.
 *
 * SAFE UNDER CONCURRENCY: snapshots the `wait` list ids up front and operates by
 * id (never by mutable list offset), re-checks each job is still `waiting`, and
 * guards the retained-terminal-dup trap on the destination. See
 * `moveWaitingTargetsToLow`. At-least-once, not exactly-once (a racing
 * attachment download can orphan one S3 object — same as the cutover tradeoff).
 * Only `waiting` jobs are moved; `delayed` retry jobs are left to finish on
 * `integration` so their remaining delay / retry budget is not reset.
 *
 * PREREQUISITE: deploy the NEW worker image to the integration/webhook workers
 * first, so NEW jobs already go to `low` — otherwise the backlog refills.
 *
 * RUN (on a host with the worker env / REDIS_URL pointing at the queue Redis):
 *   dry run:  pnpm --filter worker exec tsx scripts/move-coexist-jobs-to-low.ts
 *   execute:  pnpm --filter worker exec tsx scripts/move-coexist-jobs-to-low.ts --execute
 */
import {
  IntegrationJobAction,
  integrationQueue,
  lowQueue,
} from "@chatbotx.io/worker-config"
import type { Queue } from "bullmq"
import {
  moveWaitingTargetsToLow,
  snapshotWaitingIds,
} from "./migrate-coexist-jobs"

const TARGET_NAMES = new Set<string>([
  IntegrationJobAction.coexistAttachmentDownload,
  IntegrationJobAction.updateContactAvatar,
])

const EXECUTE = process.argv.includes("--execute")
const CONCURRENCY = Number(process.env.MOVE_CONCURRENCY ?? 100)

async function main(): Promise<void> {
  const source = integrationQueue as unknown as Queue
  const target = lowQueue as unknown as Queue

  console.log(
    EXECUTE
      ? "=== EXECUTE: moving coexistAttachmentDownload + updateContactAvatar integration → low ==="
      : "=== DRY RUN (pass --execute to actually move) ===",
  )
  const counts = await source.getJobCounts(
    "waiting",
    "delayed",
    "prioritized",
    "active",
  )
  console.log("integration counts:", counts)
  if (counts.delayed) {
    console.log(
      `NOTE: ${counts.delayed} delayed (retry) jobs are left on integration by design.`,
    )
  }
  if (counts.prioritized) {
    console.log(
      `WARNING: ${counts.prioritized} prioritized jobs are NOT scanned (target producers do not set priority; investigate if non-zero).`,
    )
  }

  const ids = await snapshotWaitingIds(source)
  console.log(`snapshotted ${ids.length} waiting ids`)

  const stats = await moveWaitingTargetsToLow({
    source,
    target,
    targetNames: TARGET_NAMES,
    ids,
    execute: EXECUTE,
    concurrency: CONCURRENCY,
    onProgress: (s, processed) => {
      console.log(`progress: processed=${processed}/${ids.length}`, s)
    },
  })

  console.log("DONE:", stats)
  console.log(
    "integration after:",
    await source.getJobCounts("waiting", "delayed"),
    "| low:",
    await target.getJobCounts("waiting", "delayed", "active"),
  )
}

main()
  .then(async () => {
    await Promise.allSettled([integrationQueue.close(), lowQueue.close()])
    process.exit(0)
  })
  .catch(async (err) => {
    console.error(err)
    await Promise.allSettled([integrationQueue.close(), lowQueue.close()])
    process.exit(1)
  })
