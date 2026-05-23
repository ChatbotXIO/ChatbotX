import type { ChannelType } from "@chatbotx.io/database/partials"
import { isCommunity } from "@/env"

export const BRANDING_TITLE = "⚡ Built with chatbotx.io"

export function getBrandingUrl(channel: ChannelType, appUrl: string) {
  const ref = isCommunity() ? "selfhosted" : "cloud"
  const url = new URL(appUrl)
  url.searchParams.set("ref", ref)
  url.searchParams.set("channel", channel)

  return url.toString()
}
