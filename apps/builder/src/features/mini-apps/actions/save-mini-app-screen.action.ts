"use server"

import { miniAppSubmissionService } from "@chatbotx.io/business/mini-app"
import { actionClient } from "@/lib/safe-action"
import {
  assertVisitorNotRateLimited,
  requireServableMiniApp,
} from "../lib/public-mini-app"
import { resolveContactVariables } from "../lib/resolve-contact-variables"
import { resolveVisitorContactId } from "../lib/resolve-visitor-contact"
import { saveMiniAppScreenRequest } from "../schema/action"

const SCREEN_SAVES_PER_WINDOW = 60

/**
 * Public (unauthenticated) save when the visitor leaves a screen: the
 * screen's mapped answers go to the contact's custom fields right away, and
 * the definition comes back with `{{variables}}` resolved again so the next
 * screen shows the new values. Anonymous visitors get no definition back.
 */
export const saveMiniAppScreenAction = actionClient
  .inputSchema(saveMiniAppScreenRequest)
  .action(async ({ parsedInput }) => {
    const miniApp = await requireServableMiniApp(parsedInput.miniAppId)
    const contactId = await resolveVisitorContactId({
      token: parsedInput.token,
      workspaceId: miniApp.workspaceId,
    })
    if (!contactId) {
      return { definition: null }
    }
    await assertVisitorNotRateLimited({
      bucket: "mini-app-screen",
      miniAppId: miniApp.id,
      contactId,
      limit: SCREEN_SAVES_PER_WINDOW,
    })

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
