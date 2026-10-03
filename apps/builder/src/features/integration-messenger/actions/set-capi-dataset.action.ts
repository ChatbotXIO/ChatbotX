"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { saveCapiDataset } from "@/features/meta-conversions/lib/capi-operations"
import { isNotFound } from "@/features/meta-conversions/lib/is-not-found"
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

      try {
        // Validates with Meta, stores it and clears a user-intent disconnect.
        await saveCapiDataset({
          channel: "messenger",
          workspaceId,
          integrationId,
          datasetId: parsedInput.datasetId,
          invalidTokenMessage: t("invalidToken"),
        })
      } catch (error) {
        if (isNotFound(error)) {
          throw new ChatbotXException(t("messengerNotFound"))
        }
        throw error
      }

      return { success: true }
    },
  )
