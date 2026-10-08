"use server"

import { integrationGoogleAdsService } from "@chatbotx.io/business"
import { connectSessionService } from "@chatbotx.io/business/connect-session"
import { redirect } from "next/navigation"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { startConnect } from "@/features/connections/lib/connect-flow"
import { resolvePlatformOwnerId } from "@/lib/platform-credential-owner"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  assertCanManageGoogleAds,
  googleAdsException,
} from "../lib/assert-can-manage-google-ads"
import {
  buildSettingsReturnUrl,
  pointReturnUrlAtSession,
  requireConsentUrl,
} from "../lib/connect-session"
import { GOOGLE_ADS_PROVIDER } from "../lib/constants"

/** Starts the Google OAuth consent for a first connect, then sends the user to Google. */
export const startGoogleAdsConnectAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId], ctx }) => {
    await assertCanManageGoogleAds({
      workspaceId,
      isSupportSession: ctx.isSupportSession,
    })
    if (!(await integrationGoogleAdsService.isConfigured(workspaceId))) {
      throw await googleAdsException("developerTokenMissing", 409)
    }

    // Abandoned attempts must not pile up toward the pending-session cap.
    await connectSessionService.cancelPendingByProvider({
      workspaceId,
      provider: GOOGLE_ADS_PROVIDER,
    })
    const { session } = await startConnect({
      workspaceId,
      provider: GOOGLE_ADS_PROVIDER,
      config: undefined,
      redirectUrl: await buildSettingsReturnUrl(workspaceId),
      ownerId: await resolvePlatformOwnerId({
        userId: ctx.user.id,
        workspaceId,
      }),
      actor: { actorUserId: ctx.user.id },
    })

    const consentUrl = await requireConsentUrl(session)
    await pointReturnUrlAtSession(session)
    return redirect(consentUrl)
  })
