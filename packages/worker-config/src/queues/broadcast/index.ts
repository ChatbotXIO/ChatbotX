import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueName } from "../../lib/types"

export const DEFAULT_BROADCAST_RATE_LIMIT = 500

export const BroadcastJobAction = {
  processBroadcastContacts: "processBroadcastContacts",
} as const

export type BroadcastJobProcessContacts = {
  type: typeof BroadcastJobAction.processBroadcastContacts
  data: Record<string, never>
}

export type BroadcastJobData = BroadcastJobProcessContacts

export const broadcastQueue =
  process.env.NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue<BroadcastJobData>(queueName.broadcast, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
