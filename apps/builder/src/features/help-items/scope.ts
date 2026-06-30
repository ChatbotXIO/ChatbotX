import { isSuperAdmin, resolveAdminTenantId } from "@chatbotx.io/business"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { z } from "zod"

export const helpItemScopeSchema = z.enum(["tenant", "platform"])
export type HelpItemScope = z.infer<typeof helpItemScopeSchema>

/**
 * Resolve the tenantId for a help-item action.
 *
 * - `"platform"` → `ROOT_TENANT_ID`. Requires the caller to be a super admin
 *   (`PLATFORM_ADMIN_EMAIL`). Used by the `/admin` console.
 * - `"tenant"` → the caller's own active cloud tenant. Cloud-only: throws
 *   Unauthorized for self-hosted users (no active cloud tenant). Used by
 *   `/manage`.
 *
 * Never accepts a tenantId from client input — always derived from identity.
 */
export const resolveHelpItemTenantId = async (
  user: UserModel,
  scope: HelpItemScope,
): Promise<string> => {
  if (scope === "platform") {
    if (!isSuperAdmin(user)) {
      throw new Error("Unauthorized")
    }
    return ROOT_TENANT_ID
  }

  const tenantId = await resolveAdminTenantId(user, {
    requireActiveCloudTenant: true,
  })
  if (!tenantId) {
    throw new Error("Unauthorized")
  }
  return tenantId
}
