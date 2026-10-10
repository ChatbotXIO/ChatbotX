"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  miniAppService,
  miniAppSubmissionService,
} from "@chatbotx.io/business/mini-app"
import { verifyMiniAppToken } from "@chatbotx.io/encryption/mini-app-token"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import {
  checkGuestRateLimit,
  resolveGuestRateLimitKey,
} from "@/lib/rate-limit/guest-rate-limit"
import { actionClient } from "@/lib/safe-action"
import { loadServableWorkspace } from "@/lib/workspace/load-servable-workspace"
import { submitMiniAppRequest } from "../schema/action"

/**
 * Public (unauthenticated) submit from the Mini App runner. The contact is
 * taken only from the signed `{{mini_app_token}}`, never from the request.
 */
export const submitMiniAppAction = actionClient
  .inputSchema(submitMiniAppRequest)
  .action(async ({ parsedInput }) => {
    const t = await getTranslations("miniApps.public")

    const miniApp = await miniAppService.findUnscoped(parsedInput.miniAppId)
    if (!miniApp?.enabled) {
      throw new ChatbotXException(t("notFoundDescription"), "notFound", 404)
    }
    const { servable } = await loadServableWorkspace(miniApp.workspaceId)
    if (!servable) {
      throw new ChatbotXException(t("notFoundDescription"), "notFound", 404)
    }

    const payload = parsedInput.token
      ? await verifyMiniAppToken(parsedInput.token).catch(() => null)
      : null
    // A token for another workspace is ignored rather than trusted.
    const contactId =
      payload && payload.workspaceId === miniApp.workspaceId
        ? payload.contactId
        : null

    const rateLimit = await checkGuestRateLimit({
      webchatId: `mini-app:${miniApp.id}`,
      clientIp: resolveGuestRateLimitKey(
        await headers(),
        contactId ? `contact:${contactId}` : "anonymous",
      ),
      ipLimit: 10,
    })
    if (rateLimit.limited) {
      throw new ChatbotXException(t("rateLimited"), "rateLimited", 429)
    }

    await miniAppSubmissionService.create({
      miniApp,
      contactId,
      answers: parsedInput.answers,
      sourceTimezone: parsedInput.timezone,
    })
    return { success: true as const }
  })
