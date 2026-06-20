import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

/**
 * Cross-repo contract queue. The OSS app produces `publishEntitlements` jobs
 * (e.g. on sign-up); the enterprise `quota-worker` consumes them and writes the
 * user's entitlement snapshot. The contract is the queue NAME + job shape only —
 * no enterprise package is imported into OSS.
 */
export const QuotaJobAction = {
  publishEntitlements: "publishEntitlements",
} as const

export type QuotaJobPublishEntitlements = {
  type: typeof QuotaJobAction.publishEntitlements
  data: { userId: string }
}

export type QuotaJobData = QuotaJobPublishEntitlements

export const quotaQueue =
  process.env.NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue<QuotaJobData>(queueNames.enum.quota, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
