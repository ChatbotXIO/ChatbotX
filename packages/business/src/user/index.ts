import type { UserModel } from "@chatbotx.io/database/types"
import { platformSettingService } from "../enterprise/platform-setting/service"
import { isCloud, keys } from "../keys"

export const isPlatformAdmin = async (user: UserModel): Promise<boolean> => {
  if (isCloud()) {
    const setting = await platformSettingService.findForUser(user.id)
    return Boolean(setting?.isEnabled)
  }
  const { PLATFORM_ADMIN_EMAIL } = keys()
  return Boolean(PLATFORM_ADMIN_EMAIL && user.email === PLATFORM_ADMIN_EMAIL)
}

/**
 * The real SaaS operator (super admin), identified by PLATFORM_ADMIN_EMAIL in
 * every edition (cloud included). Distinct from `isPlatformAdmin`, which in
 * cloud means "white-label user". The super admin manages the platform-scoped
 * (NULL userId) default credentials that serve non-white-label customers.
 */
export const isSuperAdmin = (user: UserModel): boolean => {
  const { PLATFORM_ADMIN_EMAIL } = keys()
  return Boolean(PLATFORM_ADMIN_EMAIL && user.email === PLATFORM_ADMIN_EMAIL)
}
