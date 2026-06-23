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
  // Reconcile every user's entitlement snapshot — produced by the enterprise
  // admin after a default-plan change (existing users hold a UserQuota row, so
  // the default-plan snapshot alone never reaches them). Consumed by the
  // enterprise quota-worker, which runs the backfill loop.
  backfillDefaultPlan: "backfillDefaultPlan",
} as const

export type QuotaJobPublishEntitlements = {
  type: typeof QuotaJobAction.publishEntitlements
  data: { userId: string }
}

export type QuotaJobBackfillDefaultPlan = {
  type: typeof QuotaJobAction.backfillDefaultPlan
  data: Record<string, never>
}

export type QuotaJobData =
  | QuotaJobPublishEntitlements
  | QuotaJobBackfillDefaultPlan

export const quotaQueue =
  process.env.NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue<QuotaJobData>(queueNames.enum.quota, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
