"use server"

import {
  messengerIntegrationService,
  metaConversionsService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { ensureDataset } from "@chatbotx.io/integration-meta-conversions"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
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

      await metaConversionsService.provisionDatasetNow({
        channel: "messenger",
        integration,
        provisionDataset: ({ accessToken, resourceId }) =>
          ensureDataset({ resourceType: "page", resourceId, accessToken }),
      })

      return { success: true }
    },
  )
