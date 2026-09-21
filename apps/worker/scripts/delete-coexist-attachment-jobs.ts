/**
 * One-off DESTRUCTIVE cleanup: permanently delete pending
 * `coexistAttachmentDownload` jobs from a queue.
 *
 * ⚠️ This does NOT move or process the jobs — it DROPS them. The Coexist
 * historical attachments those jobs would have mirrored to S3 stay "pending"
 * (their `originPath` keeps the Graph/`wa-media:` sentinel), so those old
 * inbox attachments will not render until a future Coexist sync re-enqueues
 * them. Only `coexistAttachmentDownload` is touched — avatars and every other
 * job type are left alone.
 *
 * SAFE UNDER CONCURRENCY: snapshots the `wait` list ids up front and operates
 * by id (never by mutable list offset), re-checks each job is still `waiting`,
 * and skips jobs a worker locked mid-delete. Only `waiting` is removed;
 * active/delayed/completed/failed are left alone.
 *
 * RUN (host with the worker env / REDIS_URL at the queue Redis):
 *   dry run:  pnpm --filter worker delete:coexist-attachment
 *   execute:  pnpm --filter worker delete:coexist-attachment -- --execute
 *   queue:    DELETE_QUEUE=integration pnpm --filter worker delete:coexist-attachment      (default: low)
 *   tune:     DELETE_CONCURRENCY=200 ...                                                    (default: 100)
 */
import {
  IntegrationJobAction,
  integrationQueue,
  lowQueue,
} from "@chatbotx.io/worker-config"
import type { Queue } from "bullmq"
import {
  deleteWaitingTargetsById,
  snapshotWaitingIds,
} from "./migrate-coexist-jobs"

const TARGET_NAMES = new Set<string>([
  IntegrationJobAction.coexistAttachmentDownload,
])

const EXECUTE = process.argv.includes("--execute")
const CONCURRENCY = Number(process.env.DELETE_CONCURRENCY ?? 100)
const QUEUE_NAME = process.env.DELETE_QUEUE ?? "low"

function pickQueue(): Queue {
  if (QUEUE_NAME === "low") {
    return lowQueue as unknown as Queue
  }
  if (QUEUE_NAME === "integration") {
    return integrationQueue as unknown as Queue
  }
  throw new Error(
    `Unsupported DELETE_QUEUE "${QUEUE_NAME}" (use low|integration)`,
  )
}

async function main(): Promise<void> {
  const queue = pickQueue()

  console.log(
    EXECUTE
      ? `=== EXECUTE: deleting coexistAttachmentDownload from "${QUEUE_NAME}" queue ===`
      : `=== DRY RUN (pass --execute to actually delete) — queue "${QUEUE_NAME}" ===`,
  )
  console.log(
    `${QUEUE_NAME} counts:`,
    await queue.getJobCounts("waiting", "delayed", "active"),
  )

  const ids = await snapshotWaitingIds(queue)
  console.log(`snapshotted ${ids.length} waiting ids`)

  const stats = await deleteWaitingTargetsById({
    queue,
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
    `${QUEUE_NAME} after:`,
    await queue.getJobCounts("waiting", "delayed", "active"),
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
