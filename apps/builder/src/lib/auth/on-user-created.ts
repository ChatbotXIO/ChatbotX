import type { AuthCreatedUser } from "@chatbotx.io/auth/server"
import { QuotaJobAction, quotaQueue } from "@chatbotx.io/worker-config"
import { isCloud } from "@/env"
import { logger } from "@/lib/log"

/**
 * Wired into `createAuth` as the `onUserCreated` callback, so it fires once on
 * every sign-up path (email/password, social, magic link). On cloud it enqueues
 * a `publishEntitlements` job on the BullMQ `quota` queue — the cross-repo
 * contract the private `quota-worker` consumes to write the new user's
 * trial/free entitlement snapshot. The contract is the queue name + job shape
 * only; no enterprise package is imported here. On other editions it's a no-op
 * (no quota row → unlimited). Anonymous-plugin users are skipped — they're
 * throwaway accounts that shouldn't get a subscription.
 *
 * Best-effort: a brief gap between sign-up and the worker writing the per-user
 * row is covered by the fail-open `entitlements:default-plan` overlay, so a
 * failed enqueue is logged and swallowed and never blocks sign-up. The backfill
 * job reconciles anything missed here.
 */
export async function onUserCreated(user: AuthCreatedUser): Promise<void> {
  if (!isCloud() || user.isAnonymous) {
    return
  }

  try {
    await quotaQueue.add(QuotaJobAction.publishEntitlements, {
      type: QuotaJobAction.publishEntitlements,
      data: { userId: user.id },
    })
  } catch (err) {
    logger.warn(
      { err, userId: user.id },
      "Failed to enqueue entitlement publish on sign-up",
    )
  }
}
