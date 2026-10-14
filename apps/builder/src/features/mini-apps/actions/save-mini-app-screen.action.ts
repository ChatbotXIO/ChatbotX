"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  miniAppService,
  miniAppSubmissionService,
} from "@chatbotx.io/business/mini-app"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import {
  checkGuestRateLimit,
  resolveGuestRateLimitKey,
} from "@/lib/rate-limit/guest-rate-limit"
import { actionClient } from "@/lib/safe-action"
import { loadServableWorkspace } from "@/lib/workspace/load-servable-workspace"
import { resolveContactVariables } from "../lib/resolve-contact-variables"
import { resolveVisitorContactId } from "../lib/resolve-visitor-contact"
import { saveMiniAppScreenRequest } from "../schema/action"

/**
 * Public (unauthenticated) save when the visitor leaves a screen: the
 * screen's mapped answers go to the contact's custom fields right away, and
 * the definition comes back with `{{variables}}` resolved again so the next
 * screen shows the new values. Anonymous visitors get no definition back.
 */
export const saveMiniAppScreenAction = actionClient
  .inputSchema(saveMiniAppScreenRequest)
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

    const contactId = await resolveVisitorContactId({
      token: parsedInput.token,
      workspaceId: miniApp.workspaceId,
    })
    if (!contactId) {
      return { definition: null }
    }

    const rateLimit = await checkGuestRateLimit({
      webchatId: `mini-app-screen:${miniApp.id}`,
      clientIp: resolveGuestRateLimitKey(
        await headers(),
        `contact:${contactId}`,
      ),
      ipLimit: 60,
    })
    if (rateLimit.limited) {
      throw new ChatbotXException(t("rateLimited"), "rateLimited", 429)
    }

    const saved = await miniAppSubmissionService.saveScreenAnswers({
      miniApp,
      contactId,
      screenKey: parsedInput.screenKey,
      answers: parsedInput.answers,
      sourceTimezone: parsedInput.timezone,
    })
    if (!saved) {
      return { definition: null }
    }
    return {
      definition: await resolveContactVariables({
        definition: miniApp.definition,
        workspaceId: miniApp.workspaceId,
        contactId,
      }),
    }
  })
