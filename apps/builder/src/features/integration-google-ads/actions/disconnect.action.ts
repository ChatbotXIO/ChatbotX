"use server"

import { integrationGoogleAdsService } from "@chatbotx.io/business"
import { connectionService } from "@chatbotx.io/connections"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"
import {
  assertCanManageGoogleAds,
  googleAdsException,
} from "../lib/assert-can-manage-google-ads"

// Allowed after trial expiry (AGENTS.md invariant 14): disconnecting must stay
// available when the workspace is read/delete-only.
export const disconnectGoogleAdsAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId], ctx }) => {
    await assertCanManageGoogleAds({
      workspaceId,
      isSupportSession: ctx.isSupportSession,
    })
    const setup = await integrationGoogleAdsService.getSetup(workspaceId)
    if (!setup?.connection) {
      throw await googleAdsException("notConnected", 404)
    }
    await connectionService.disconnect({
      connectionId: setup.connection.id,
      workspaceId,
    })
  })
