import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { tenantService } from "../enterprise/tenant/service"
import { isCloud } from "../keys"
import { isSuperAdmin } from "./utils"

type AdminUser = Pick<UserModel, "id" | "email">

export async function resolveAdminTenantId(
  user: AdminUser,
  options?: { requireActiveCloudTenant?: boolean },
): Promise<string | null> {
  if (isCloud()) {
    const tenant = await tenantService.findByOwner(user.id)
    if (tenant?.status === "active") {
      return tenant.id
    }
    if (options?.requireActiveCloudTenant) {
      return null
    }
  }
  // Self-hosted: only a platform super admin may target the root tenant.
  if (!(await isSuperAdmin(user))) {
    return null
  }
  return ROOT_TENANT_ID
}
