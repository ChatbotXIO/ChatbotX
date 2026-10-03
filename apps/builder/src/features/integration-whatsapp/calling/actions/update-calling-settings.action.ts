"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { callingAdminActionClient } from "@/lib/safe-action"
import { updateWhatsappCallingSettings } from "../lib/calling-operations"
import {
  type UpdateWhatsappCallingSettingsSchema,
  updateWhatsappCallingSettingsSchema,
} from "../schemas/update-calling-settings-schema"

export const updateWhatsappCallingSettingsAction = callingAdminActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateWhatsappCallingSettingsSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId, integrationWhatsappId],
    }: {
      parsedInput: UpdateWhatsappCallingSettingsSchema
      bindArgsParsedInputs: readonly [string, string]
    }) => {
      const t = await getTranslations()
      // Calling settings affect Meta billing (business-initiated calls are
      // paid) — gate on super admin like connect/reconnect, not mere
      // membership.
      await assertWorkspaceSuperAdmin(workspaceId)
      await updateWhatsappCallingSettings({
        workspaceId,
        integrationWhatsappId,
        input: parsedInput,
        messages: {
          notFound: t("whatsapp.calls.errors.notFound"),
          transcriptionRequiresRecording: t(
            "whatsapp.calls.errors.transcriptionRequiresRecording",
          ),
          updateFailed: t("whatsapp.calls.errors.updateFailed"),
          savedOnMetaOnly: t("whatsapp.calls.errors.savedOnMetaOnly"),
        },
      })
    },
  )
