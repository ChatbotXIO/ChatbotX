import {
  resolveTenantSettingsByDomain,
  type TenantSettings,
} from "@chatbotx.io/business"
import { getDomainFromHeader } from "@/lib/domain"

export const getTenantSettings = async (): Promise<TenantSettings> => {
  const domain = await getDomainFromHeader()
  return resolveTenantSettingsByDomain(domain)
}
