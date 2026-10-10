"use server"

import { integrationGoogleAdsService } from "@chatbotx.io/business"
import { connectSessionService } from "@chatbotx.io/business/connect-session"
import { connectionService } from "@chatbotx.io/connections"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  assertCanManageGoogleAds,
  googleAdsException,
} from "../lib/assert-can-manage-google-ads"
import { requireGoogleAdsSession } from "../lib/connect-session"
import { pickGoogleAdsAccountRequest } from "../schema/actions"

/**
 * A retry after the connection committed but completion/refresh failed makes
 * the engine answer `duplicated` (it also does so for any already-connected
 * target and does not say which workspace holds it). That is recoverable
 * success only when THIS workspace's own active Google Ads connection is
 * exactly the selected customer; anything else stays a failure.
 */
const isRecoverableDuplicate = async (
  outcomes: { targetId: string; status: string }[],
  workspaceId: string,
  customerId: string,
): Promise<boolean> => {
  const duplicated = outcomes.some(
    (outcome) =>
      outcome.targetId === customerId && outcome.status === "duplicated",
  )
  if (!duplicated) {
    return false
  }
  const setup = await integrationGoogleAdsService.getSetup(workspaceId)
  return (
    setup?.integration.customerId === customerId &&
    setup.readiness !== "needs_reauth"
  )
}

/**
 * Finishes an `awaiting_selection` session with the chosen customer (completing
 * it explicitly, see below), then
 * resolves the conversion customer and syncs its conversion actions. The
 * session is verified to belong to this workspace AND to Google Ads first: the
 * engine's `connectTargets` only checks workspace membership.
 */
export const pickGoogleAdsAccountAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(pickGoogleAdsAccountRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput: { sessionId, customerId },
      ctx,
    }) => {
      await assertCanManageGoogleAds({
        workspaceId,
        isSupportSession: ctx.isSupportSession,
      })
      await requireGoogleAdsSession({ sessionId, workspaceId })

      const { outcomes } = await connectionService.connectTargets({
        sessionId,
        workspaceId,
        targetIds: [customerId],
        actorUserId: ctx.user.id,
      })
      const connected = outcomes.some(
        (outcome) => outcome.status === "connected",
      )
      if (
        !(
          connected ||
          (await isRecoverableDuplicate(outcomes, workspaceId, customerId))
        )
      ) {
        throw await googleAdsException("pickFailed", 409)
      }

      // A workspace holds one Google Ads account, so the other selectable
      // customers can never resolve and the engine would leave the session in
      // `awaiting_selection` (picker still shown, a second pick doomed).
      // Close it and drop the remaining candidates' encrypted tokens.
      await connectSessionService.completeSelection({
        id: sessionId,
        workspaceId,
      })

      const setup = await integrationGoogleAdsService.refreshSetup(workspaceId)
      return {
        readiness: setup?.readiness ?? null,
        setupError: setup?.integration.setupError ?? null,
      }
    },
  )
