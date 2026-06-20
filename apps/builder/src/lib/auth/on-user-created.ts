import type { AuthCreatedUser } from "@chatbotx.io/auth/server"
import { billingService } from "@chatbotx.io/business"
import { isCloud } from "@/env"

/**
 * Wired into `createAuth` as the `onUserCreated` callback, so it fires once on
 * every sign-up path (email/password, social, magic link). On cloud it asks the
 * private billing portal to provision the new user's default plan; on other
 * editions it's a no-op (no quota row → unlimited). Anonymous-plugin users are
 * skipped — they're throwaway accounts that shouldn't get a subscription.
 *
 * Best-effort: `billingService.provisionDefaultPlan` swallows and logs its own
 * errors, and the auth hook also guards against throws, so nothing here can
 * block sign-up.
 */
export async function onUserCreated(user: AuthCreatedUser): Promise<void> {
  if (!isCloud() || user.isAnonymous) {
    return
  }

  await billingService.provisionDefaultPlan({
    userId: user.id,
    tenantId: user.tenantId,
  })
}
