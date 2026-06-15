import {
  resolveTenantSettingsByDomain,
  type TenantSettings,
} from "@chatbotx.io/business"
import { cache } from "react"
import { getDomainFromHeader } from "@/lib/domain"

export const getTenantSettings = cache(async (): Promise<TenantSettings> => {
  const domain = await getDomainFromHeader()
  return resolveTenantSettingsByDomain(domain)
})
