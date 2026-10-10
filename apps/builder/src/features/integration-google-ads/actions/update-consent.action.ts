"use server"

import { googleAdsSettingsService } from "@chatbotx.io/business"
import { googleAdsConsentSchema } from "@chatbotx.io/database/partials"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { assertCanManageGoogleAds } from "../lib/assert-can-manage-google-ads"

/**
 * Saves the workspace's conversion data consent. The workspace comes from the
 * bound argument only: the payload is the consent itself, so there is no
 * field through which another workspace could be addressed. Not allowed after
 * trial expiry (AGENTS.md invariant 14): it edits settings, it is not a
 * delete / disconnect.
 */
export const updateGoogleAdsConsentAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(googleAdsConsentSchema)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput, ctx }) => {
    await assertCanManageGoogleAds({
      workspaceId,
      isSupportSession: ctx.isSupportSession,
    })
    return await googleAdsSettingsService.updateConsent(
      workspaceId,
      parsedInput,
    )
  })
