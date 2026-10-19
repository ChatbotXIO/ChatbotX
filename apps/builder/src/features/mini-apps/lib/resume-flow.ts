import "server-only"

import { createHash } from "node:crypto"
import { automatedResponseService } from "@chatbotx.io/automated-response"
import { workspaceService } from "@chatbotx.io/business"
import { verifyMiniAppResumeToken } from "@chatbotx.io/encryption/mini-app-token"
import { distributedStore } from "@chatbotx.io/redis"
import { logger } from "@/lib/log"

// Outlives the 7-day resume token, so a token can never continue a flow twice.
const RESUME_ONCE_TTL_SECONDS = 8 * 24 * 60 * 60

const buildResumeOnceKey = (resumeToken: string) =>
  `mini-app-resume:${createHash("sha256").update(resumeToken).digest("hex")}`

/**
 * Continues the flow an "Open Mini App" button was sent from, once its Mini
 * App is submitted: the button is replayed as a tap, so its additional steps
 * run and the flow follows its edge to the next node.
 *
 * The token must have been signed for this Mini App and for the contact the
 * submission is attributed to; anything else is ignored. Like a real tap, it
 * only runs while the bot is on and within its active hours (a standby thread
 * cannot be detected here). A token continues the flow at most once, however
 * many times the Mini App is submitted — unless the bot was off or queueing
 * failed, in which case a later submit may still continue it. Never throws:
 * the submission is already saved by the time this runs.
 */
export async function resumeFlowAfterMiniAppSubmit(input: {
  resumeToken: string
  miniAppId: string
  workspaceId: string
  contactId: string | null
}): Promise<void> {
  try {
    const payload = await verifyMiniAppResumeToken(input.resumeToken).catch(
      () => null,
    )
    if (
      !(
        payload &&
        input.contactId &&
        payload.workspaceId === input.workspaceId &&
        payload.miniAppId === input.miniAppId &&
        payload.contactId === input.contactId
      )
    ) {
      return
    }

    const workspace = await workspaceService.findById({
      id: input.workspaceId,
    })
    if (!workspaceService.isActiveNow(workspace)) {
      logger.info(
        { miniAppId: input.miniAppId, workspaceId: input.workspaceId },
        "Bot is not active; the flow does not continue after the Mini App submit",
      )
      return
    }

    const onceKey = buildResumeOnceKey(input.resumeToken)
    const isFirstSubmit = await distributedStore.setNumberIfNotExists(
      onceKey,
      1,
      RESUME_ONCE_TTL_SECONDS,
    )
    if (!isFirstSubmit) {
      return
    }

    const queued = await automatedResponseService.enqueueFlowAction({
      kind: "postback",
      data: {
        conversationId: payload.conversationId,
        contactInboxId: payload.contactInboxId,
        action: payload.buttonPayload,
      },
    })
    if (!queued) {
      // Hand the token back so the next submit can try again.
      await distributedStore.delete(onceKey)
    }
  } catch (error) {
    logger.error(
      { err: error, miniAppId: input.miniAppId },
      "Unable to continue the flow after a Mini App submit",
    )
  }
}
