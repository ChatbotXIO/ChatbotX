import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getQueueConnection,
  isNoRedisEnv,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

/**
 * Turns due slots of repeating broadcasts into runs. A dedicated queue (and
 * worker) so that a burst of due series never queues behind — or in front of —
 * the shared `schedule` crons; the runs it creates are then sent by the
 * existing pipeline, unchanged.
 */
export const BroadcastRecurrenceJobAction = {
  materializeRecurringBroadcasts: "materializeRecurringBroadcasts",
} as const

/** One due slot: the series, its workspace (for the blocked-owner guard) and the armed instant. */
export type MaterializeRecurringBroadcastItem = {
  recurrenceId: string
  workspaceId: string
  occurrenceAtMs: number
}

export type BroadcastRecurrenceJobMaterialize = {
  type: typeof BroadcastRecurrenceJobAction.materializeRecurringBroadcasts
  data: { items: MaterializeRecurringBroadcastItem[] }
}

export type BroadcastRecurrenceJobData = BroadcastRecurrenceJobMaterialize

/** Series handled by one job. */
export const MATERIALIZE_BATCH_SIZE = 100
/** Series a worker slot materializes in parallel inside one job. */
export const MATERIALIZE_ITEM_CONCURRENCY = 10

/** No `:` — BullMQ rejects it in a custom job id. */
export const materializeBatchJobId = (
  dueAtMs: number,
  page: number,
  chunk: number,
) => `broadcast-recurrence-${dueAtMs}-${page}-${chunk}`

export const broadcastRecurrenceQueue = isNoRedisEnv()
  ? fakeQueue
  : new Queue<BroadcastRecurrenceJobData>(queueNames.enum.broadcastRecurrence, {
      connection: getQueueConnection(queueNames.enum.broadcastRecurrence),
      defaultJobOptions,
    })
