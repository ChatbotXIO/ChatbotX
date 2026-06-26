import { Queue } from "bullmq"
import {
  defaultJobOptions,
  fakeQueue,
  getRedisConnection,
} from "../../lib/connection"
import { queueNames } from "../../lib/types"

/**
 * Cross-repo contract queue. The OSS app produces `publishEntitlements` jobs
 * (e.g. on sign-up); the enterprise `quota-worker` consumes them and reconciles
 * the user's entitlement snapshot. Cloud sign-up may already have an
 * OSS-stamped bootstrap trial row, which the worker overwrites and re-anchors.
 * The contract is the queue NAME + job shape only — no enterprise package is
 * imported into OSS.
 */
export const QuotaJobAction = {
  publishEntitlements: "publishEntitlements",
  // Reconcile every user's entitlement snapshot — produced by the enterprise
  // admin after a default-plan change (existing users hold a UserQuota row, so
  // the default-plan snapshot alone never reaches them). Consumed by the
  // enterprise quota-worker, which runs the backfill loop.
  backfillDefaultPlan: "backfillDefaultPlan",
  // Reconcile only one tenant's users — produced by the enterprise portal when a
  // reseller changes their tenant's default plan. Scopes the backfill to that
  // reseller's sub-accounts instead of every user.
  backfillTenantDefaultPlan: "backfillTenantDefaultPlan",
} as const

export type QuotaJobPublishEntitlements = {
  type: typeof QuotaJobAction.publishEntitlements
  data: { userId: string }
}

export type QuotaJobBackfillDefaultPlan = {
  type: typeof QuotaJobAction.backfillDefaultPlan
  data: Record<string, never>
}

export type QuotaJobBackfillTenantDefaultPlan = {
  type: typeof QuotaJobAction.backfillTenantDefaultPlan
  data: { tenantId: string }
}

export type QuotaJobData =
  | QuotaJobPublishEntitlements
  | QuotaJobBackfillDefaultPlan
  | QuotaJobBackfillTenantDefaultPlan

export const quotaQueue =
  process.env.NEXT_PHASE === "phase-production-build"
    ? fakeQueue
    : new Queue<QuotaJobData>(queueNames.enum.quota, {
        connection: getRedisConnection(),
        defaultJobOptions,
      })
