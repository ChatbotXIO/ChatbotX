import type { ChannelType } from "@chatbotx.io/database/partials"
import { env, isCommunity } from "@/env"

export const BRANDING_TITLE = "⚡ Built with chatbotx.io"

export function getBrandingUrl(channel: ChannelType) {
  const ref = isCommunity ? "selfhosted" : "cloud"
  return new URL(
    `?ref=${ref}&channel=${channel}`,
    env.NEXT_PUBLIC_BUILDER_URL,
  ).toString()
}
