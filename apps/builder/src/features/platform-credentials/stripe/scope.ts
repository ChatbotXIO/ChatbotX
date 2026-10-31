import { isSuperAdmin } from "@chatbotx.io/business"
import type { UserModel } from "@chatbotx.io/database/types"
import { type CredentialScope, resolveCredentialScopedUserId } from "../scope"

/**
 * As `resolveCredentialScopedUserId`, and stricter: the Stripe settings move
 * every connected store's money, so the platform-wide ones (self-hosted, or
 * the `"platform"` scope) are only ever written by a super admin. A reseller
 * on the cloud edition writes their own.
 */
export const resolveStripeCredentialScope = async (
  user: UserModel,
  scope: CredentialScope,
  options?: { allowWithoutEntitlement?: boolean },
): Promise<string | undefined> => {
  const userId = await resolveCredentialScopedUserId(user, scope, options)
  if (userId === undefined && !(await isSuperAdmin(user))) {
    throw new Error("Unauthorized")
  }
  return userId
}
