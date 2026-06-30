import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { tenantService } from "../enterprise/tenant/service"
import { isCloud, keys } from "../keys"

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
  // Self-hosted: only the platform admin (PLATFORM_ADMIN_EMAIL) may target the root tenant
  const { PLATFORM_ADMIN_EMAIL } = keys()
  if (!(PLATFORM_ADMIN_EMAIL && user.email === PLATFORM_ADMIN_EMAIL)) {
    return null
  }
  return ROOT_TENANT_ID
}
