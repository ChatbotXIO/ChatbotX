"use server"

import { miniAppSubmissionService } from "@chatbotx.io/business/mini-app"
import { actionClient } from "@/lib/safe-action"
import {
  assertVisitorNotRateLimited,
  requireServableMiniApp,
} from "../lib/public-mini-app"
import { resolveVisitorContactId } from "../lib/resolve-visitor-contact"
import { submitMiniAppRequest } from "../schema/action"

const SUBMITS_PER_WINDOW = 10

/**
 * Public (unauthenticated) submit from the Mini App runner. The contact is
 * taken only from the signed `{{mini_app_token}}`, never from the request.
 */
export const submitMiniAppAction = actionClient
  .inputSchema(submitMiniAppRequest)
  .action(async ({ parsedInput }) => {
    const miniApp = await requireServableMiniApp(parsedInput.miniAppId)
    const contactId = await resolveVisitorContactId({
      token: parsedInput.token,
      workspaceId: miniApp.workspaceId,
    })
    await assertVisitorNotRateLimited({
      bucket: "mini-app",
      miniAppId: miniApp.id,
      contactId,
      limit: SUBMITS_PER_WINDOW,
    })

    await miniAppSubmissionService.create({
      miniApp,
      contactId,
      answers: parsedInput.answers,
      sourceTimezone: parsedInput.timezone,
    })
    return { success: true as const }
  })
