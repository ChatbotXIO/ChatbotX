import { buildBrandingUrl } from "@chatbotx.io/business/branding"
import type { ChannelType } from "@chatbotx.io/database/partials"
import { isCommunity } from "@/env"

export { BRANDING_TITLE } from "@chatbotx.io/business/branding"

export function getBrandingUrl(channel: ChannelType, appUrl: string) {
  return buildBrandingUrl(appUrl, channel, isCommunity())
}
