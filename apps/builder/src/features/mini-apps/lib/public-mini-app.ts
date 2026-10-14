import "server-only"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { miniAppService } from "@chatbotx.io/business/mini-app"
import type { MiniAppModel } from "@chatbotx.io/database/types"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import {
  checkGuestRateLimit,
  resolveGuestRateLimitKey,
} from "@/lib/rate-limit/guest-rate-limit"
import { loadServableWorkspace } from "@/lib/workspace/load-servable-workspace"

/**
 * The Mini App behind a public link, or null when it does not exist, is
 * disabled, or its workspace may not serve public pages.
 */
export async function loadServableMiniApp(
  id: string,
): Promise<MiniAppModel | null> {
  const miniApp = await miniAppService.findUnscoped(id)
  if (!miniApp?.enabled) {
    return null
  }
  const { servable } = await loadServableWorkspace(miniApp.workspaceId)
  return servable ? miniApp : null
}

/** Like `loadServableMiniApp`, for public actions: throws `notFound` instead of returning null. */
export async function requireServableMiniApp(
  id: string,
): Promise<MiniAppModel> {
  const miniApp = await loadServableMiniApp(id)
  if (!miniApp) {
    const t = await getTranslations("miniApps.public")
    throw new ChatbotXException(t("notFoundDescription"), "notFound", 404)
  }
  return miniApp
}

/**
 * Throws `rateLimited` once a visitor (by contact, else by IP) sent more than
 * `limit` requests of one kind to this Mini App within the window.
 */
export async function assertVisitorNotRateLimited(input: {
  /** Kind of request, so submits and screen saves count separately. */
  bucket: string
  miniAppId: string
  contactId: string | null
  limit: number
}): Promise<void> {
  const rateLimit = await checkGuestRateLimit({
    webchatId: `${input.bucket}:${input.miniAppId}`,
    clientIp: resolveGuestRateLimitKey(
      await headers(),
      input.contactId ? `contact:${input.contactId}` : "anonymous",
    ),
    ipLimit: input.limit,
  })
  if (rateLimit.limited) {
    const t = await getTranslations("miniApps.public")
    throw new ChatbotXException(t("rateLimited"), "rateLimited", 429)
  }
}
