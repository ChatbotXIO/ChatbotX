"use server"

import { integrationGoogleAdsService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"
import { googleAdsException } from "../lib/assert-can-manage-google-ads"

/** Re-resolves the conversion customer and re-reads its conversion actions; failures land in `setupError`. */
export const syncGoogleAdsConversionActionsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId] }) => {
    // Sync only reads from Google and refreshes our cache; unlike the
    // connect / send mutations it stays available to a support session.
    await assertWorkspaceSuperAdmin(workspaceId)
    const setup = await integrationGoogleAdsService.refreshSetup(workspaceId)
    if (!setup) {
      throw await googleAdsException("notConnected", 404)
    }
    return {
      readiness: setup.readiness,
      setupError: setup.integration.setupError ?? null,
    }
  })
