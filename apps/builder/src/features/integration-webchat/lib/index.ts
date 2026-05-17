import type { ChannelType } from "@chatbotx.io/database/partials"
import { isCommunity } from "@/env"

export const BRANDING_TITLE = "⚡ Built with chatbotx.io"

export function getBrandingUrl(channel: ChannelType, appUrl: string) {
  const ref = isCommunity ? "selfhosted" : "cloud"
  return new URL(`?ref=${ref}&channel=${channel}`, appUrl).toString()
}
