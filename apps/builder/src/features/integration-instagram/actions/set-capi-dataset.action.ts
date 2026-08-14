"use server"

import {
  instagramIntegrationService,
  metaConversionsService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getDataset } from "@chatbotx.io/integration-meta-conversions"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { surfaceCapiError } from "@/features/meta-conversions/lib/surface-capi-error"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"

export const setInstagramCapiDatasetAction = workspaceActionClient
  .inputSchema(
    z.object({
      datasetId: z.string().trim().min(1),
    }),
  )
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId, integrationId],
    }: {
      parsedInput: { datasetId: string }
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

      try {
        await metaConversionsService.saveDatasetId({
          channel: "instagram",
          integration,
          datasetId: parsedInput.datasetId,
          validate: getDataset,
        })
      } catch (error) {
        surfaceCapiError(error, t("invalidToken"))
      }

      // Save = connect: clear a user-intent disconnect so this is the only
      // path back from a Disconnect now that OAuth reconnect is gone.
      await metaConversionsService.reconnectCapi({
        channel: "instagram",
        integration,
      })

      return { success: true }
    },
  )
