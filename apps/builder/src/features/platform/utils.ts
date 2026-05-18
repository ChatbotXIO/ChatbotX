import {
  type PlatformSettings,
  resolvePlatformSettingsByDomain,
} from "@chatbotx.io/business"
import { cache } from "react"
import { getDomainFromHeader } from "@/lib/domain"

export const getPlatformSettings = cache(
  async (): Promise<PlatformSettings> => {
    const domain = await getDomainFromHeader()
    return resolvePlatformSettingsByDomain(domain)
  },
)
