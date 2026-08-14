"use server"

import {
  messengerIntegrationService,
  metaConversionsService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getDataset } from "@chatbotx.io/integration-meta-conversions"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { workspaceActionClient } from "@/lib/safe-action"

export const setMessengerCapiDatasetAction = workspaceActionClient
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
        await messengerIntegrationService.findByIdForWorkspace({
          id: integrationId,
          workspaceId,
        })
      if (!integration) {
        throw new ChatbotXException(t("messengerNotFound"))
      }

      try {
        await metaConversionsService.saveDatasetId({
          channel: "messenger",
          integration,
          datasetId: parsedInput.datasetId,
          validate: getDataset,
        })
      } catch {
        throw new ChatbotXException(t("invalidToken"))
      }

      return { success: true }
    },
  )
