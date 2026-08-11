import type { ChannelType } from "@chatbotx.io/database/partials"
import { logger } from "../../lib/logger"
import { refreshInstagramFacebookTokens } from "./refresh-instagram-facebook-tokens"
import { refreshInstagramTokens } from "./refresh-instagram-tokens"
import { refreshMessengerTokens } from "./refresh-messenger-tokens"
import { refreshTiktokTokens } from "./refresh-tiktok-tokens"
import { refreshWhatsappTokens } from "./refresh-whatsapp-tokens"
import { refreshZaloTokens } from "./refresh-zalo-tokens"

async function refreshInstagramAndFacebookTokens(): Promise<void> {
  await Promise.all([
    refreshInstagramTokens(),
    refreshInstagramFacebookTokens(),
  ])
}

const refreshTokenAdapter: Record<
  ChannelType,
  (() => Promise<void>) | undefined
> = {
  zalo: refreshZaloTokens,
  tiktok: refreshTiktokTokens,
  instagram: refreshInstagramAndFacebookTokens,
  messenger: refreshMessengerTokens,
  whatsapp: refreshWhatsappTokens,
  omnichannel: undefined,
  webchat: undefined,
  smtp: undefined,
  telegram: undefined,
}

export async function refreshChannelTokens(): Promise<void> {
  const entries = Object.entries(refreshTokenAdapter).filter(
    (entry): entry is [ChannelType, () => Promise<void>] =>
      entry[1] !== undefined,
  )

  const results = await Promise.allSettled(
    entries.map(([channel, refresh]) =>
      refresh().catch((error) => {
        logger.error(error, `[refreshChannelTokens] channel=${channel} failed`)
        throw error
      }),
    ),
  )
  const failed = results.filter((r) => r.status === "rejected").length
  if (failed > 0) {
    logger.warn(`[refreshChannelTokens] ${failed} channel(s) failed to run`)
  }
}
