"use server"

import { miniAppSubmissionService } from "@chatbotx.io/business/mini-app"
import { actionClient } from "@/lib/safe-action"
import {
  assertVisitorNotRateLimited,
  requireServableMiniApp,
} from "../lib/public-mini-app"
import { resolveVisitorContactId } from "../lib/resolve-visitor-contact"
import { resumeFlowAfterMiniAppSubmit } from "../lib/resume-flow"
import { submitMiniAppRequest } from "../schema/action"

const SUBMITS_PER_WINDOW = 10

/**
 * Public (unauthenticated) submit from the Mini App runner. The contact is
 * taken only from the signed `{{mini_app_token}}`, never from the request.
 * A Mini App opened from a flow's "Open Mini App" button also carries a signed
 * `resume` token, which continues that flow once the submission is saved.
 */
export const submitMiniAppAction = actionClient
  .inputSchema(submitMiniAppRequest)
  .action(async ({ parsedInput }) => {
    const miniApp = await requireServableMiniApp(parsedInput.miniAppId)
    const contactId = await resolveVisitorContactId({
      token: parsedInput.token,
      workspaceId: miniApp.workspaceId,
      miniAppId: miniApp.id,
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
    // A Messenger template's Mini App link carries its resume token as
    // `token` (see `resolveVisitorContactId`); a contact token there is
    // simply not a resume token and is ignored.
    const resumeToken = parsedInput.resume ?? parsedInput.token
    if (resumeToken) {
      await resumeFlowAfterMiniAppSubmit({
        resumeToken,
        miniAppId: miniApp.id,
        workspaceId: miniApp.workspaceId,
        contactId,
      })
    }
    return { success: true as const }
  })
