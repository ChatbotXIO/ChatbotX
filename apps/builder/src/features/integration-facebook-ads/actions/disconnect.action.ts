"use server"

import { integrationFacebookAdsService } from "@chatbotx.io/business"
import { encryptedDataSchema, encryptUtils } from "@chatbotx.io/encryption"
import {
  facebookAdsAuthSchema,
  integration as integrationFacebookAds,
} from "@chatbotx.io/integration-facebook-ads"
import { workspaceIdrequestParams } from "@/features/common/schemas"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { logger } from "@/lib/log"
import { workspaceActionClient } from "@/lib/safe-action"

export const disconnectFacebookAdsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
    }: {
      bindArgsParsedInputs: [string]
    }) => {
      await assertWorkspaceSuperAdmin(workspaceId)

      const row =
        await integrationFacebookAdsService.findByWorkspaceIdOrFail(workspaceId)

      try {
        const auth = await encryptUtils.decryptObject(
          encryptedDataSchema.parse(row.auth),
          facebookAdsAuthSchema,
        )
        await integrationFacebookAds.disconnect?.(auth)
      } catch (e) {
        logger.error(
          e,
          `Unable to revoke Facebook Ads token for workspace: ${workspaceId}`,
        )
      }

      await integrationFacebookAdsService.disconnect(workspaceId)
      return
    },
  )
