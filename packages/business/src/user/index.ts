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
