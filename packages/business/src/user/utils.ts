import type { UserModel } from "@chatbotx.io/database/types"
import { tenantService } from "../enterprise/tenant/service"
import { isCloud } from "../keys"
import { platformAdminService } from "../platform-admin/service"

export const isPlatformAdmin = async (
  user: Pick<UserModel, "id">,
): Promise<boolean> => {
  if (isCloud()) {
    const setting = await tenantService.findByOwner(user.id)
    return Boolean(setting?.status === "active")
  }
  return await isSuperAdmin(user)
}

/**
 * The real SaaS operator (super admin) is identified by an uncached persisted
 * PlatformAdmin row. PLATFORM_ADMIN_EMAIL provisions the matching root-tenant
 * user at startup or matching root-user creation.
 */
export const isSuperAdmin = async (
  user: Pick<UserModel, "id">,
): Promise<boolean> => await platformAdminService.isAdmin(user.id)
