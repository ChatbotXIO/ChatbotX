import type { AuthCreatedUser } from "@chatbotx.io/auth/server"
import { userQuotaService } from "@chatbotx.io/business"
import { QuotaJobAction, quotaQueue } from "@chatbotx.io/worker-config"
import { isCloud } from "@/env"
import { logger } from "@/lib/log"

/**
 * Wired into `createAuth` as the `onUserCreated` callback, so it fires once on
 * every sign-up path (email/password, social, magic link). On cloud it first
 * stamps a conservative bootstrap trial row, then enqueues a
 * `publishEntitlements` job on the BullMQ `quota` queue — the cross-repo
 * contract the private `quota-worker` consumes to reconcile the new user's
 * authoritative entitlement snapshot. The contract is the queue name + job
 * shape only; no enterprise package is imported here. On other editions it's a
 * no-op (no quota row → unlimited). Anonymous-plugin users are skipped —
 * they're throwaway accounts that shouldn't get a subscription.
 *
 * Best-effort: the bootstrap row closes the sign-up-to-worker gap; the
 * fail-open `entitlements:default-plan` overlay is now only a secondary
 * last-resort fallback. Failures are logged and swallowed and never block
 * sign-up. The backfill job reconciles anything missed here.
 */
export async function onUserCreated(user: AuthCreatedUser): Promise<void> {
  if (!isCloud() || user.isAnonymous) {
    return
  }

  try {
    await userQuotaService.ensureBootstrapPlan({
      userId: user.id,
      tenantId: user.tenantId,
    })
  } catch (err) {
    logger.warn(
      { err, userId: user.id },
      "Failed to stamp bootstrap quota on sign-up",
    )
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
