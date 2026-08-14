"use server"

import {
  instagramIntegrationService,
  metaConversionsService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const disconnectInstagramCapiAction = workspaceActionClientAllowExpired
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
        await instagramIntegrationService.findByIdForWorkspace({
          id: integrationId,
          workspaceId,
        })
      if (integration?.type !== "facebook") {
        throw new ChatbotXException(t("instagramNotFound"))
      }

      await metaConversionsService.disconnectCapi({
        channel: "instagram",
        integration,
      })

      return { success: true }
    },
  )
