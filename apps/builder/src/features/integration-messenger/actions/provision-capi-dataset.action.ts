"use server"

import {
  messengerIntegrationService,
  metaConversionsService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { ensureDataset } from "@chatbotx.io/integration-meta-conversions"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { surfaceCapiError } from "@/features/meta-conversions/lib/surface-capi-error"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"

export const provisionMessengerCapiDatasetAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationId],
    }: {
      bindArgsParsedInputs: readonly [string, string]
    }) => {
      const t = await getTranslations("metaConversions.errors")
      await assertWorkspaceSuperAdmin(workspaceId)

      const integration =
        await messengerIntegrationService.findByIdForWorkspace({
          id: integrationId,
          workspaceId,
        })
      if (!integration) {
        throw new ChatbotXException(t("messengerNotFound"))
      }

      try {
        await metaConversionsService.provisionDatasetNow({
          channel: "messenger",
          integration,
          provisionDataset: ({ accessToken, resourceId }) =>
            ensureDataset({ resourceType: "page", resourceId, accessToken }),
        })
      } catch (error) {
        surfaceCapiError(error)
      }

      // Save = connect: clear a user-intent disconnect so this is the only
      // path back from a Disconnect now that OAuth reconnect is gone.
      await metaConversionsService.reconnectCapi({
        channel: "messenger",
        integration,
      })

      return { success: true }
    },
  )
