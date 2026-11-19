import type { ContactSyncRunModel } from "@chatbotx.io/database/types"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  buildContactSyncJobId,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"

/** Queues the next chunk job of a run; the job id is unique per continuation revision. */
export const enqueueContactSyncChunk = async (
  run: Pick<ContactSyncRunModel, "id" | "workspaceId" | "chunkSeq">,
  options: { delayMs?: number } = {},
): Promise<void> => {
  await integrationQueue.add(
    IntegrationJobAction.contactSync,
    {
      type: IntegrationJobAction.contactSync,
      data: { runId: run.id, workspaceId: run.workspaceId },
    },
    {
      jobId: buildContactSyncJobId({ runId: run.id, chunkSeq: run.chunkSeq }),
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: { count: 100 },
      ...(options.delayMs && { delay: options.delayMs }),
    },
  )
}

const log = getChildLogger("contact-sync-queue")

/**
 * BullMQ states of a chunk job that has not finished: it will still run, or
 * is running and about to claim its run. A stalled active job is moved back
 * to waiting (or failed) by BullMQ, so none of these lasts forever.
 */
const UNFINISHED_JOB_STATES: ReadonlySet<string> = new Set([
  "waiting",
  "delayed",
  "prioritized",
  "waiting-children",
  "active",
])

/**
 * Where a chunk job stands: `waiting` (not finished), `settled` (finished
 * or gone from the queue) or `unknown` (the queue could not be read).
 */
export type ContactSyncChunkJobState = "waiting" | "settled" | "unknown"

export const contactSyncChunkJobState = async (
  runId: string,
  chunkSeq: number,
): Promise<ContactSyncChunkJobState> => {
  try {
    const job = await integrationQueue.getJob(
      buildContactSyncJobId({ runId, chunkSeq }),
    )
    if (!job) {
      return "settled"
    }
    const state = await job.getState()
    return UNFINISHED_JOB_STATES.has(state) ? "waiting" : "settled"
  } catch (err) {
    log.warn({ err, runId }, "could not look up the chunk job")
    return "unknown"
  }
}
