"use server"

import { zodBigintAsString } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { assertWorkspaceSuperAdmin } from "@/lib/auth/assert-workspace-super-admin"
import { callingAdminActionClient } from "@/lib/safe-action"
import { updateWhatsappCallHours } from "../lib/calling-operations"
import {
  type CallHoursFormValues,
  callHoursFormSchema,
} from "../schemas/call-hours-schema"

/**
 * Saves a number's weekly call hours on Meta (see `updateWhatsappCallHours`).
 */
export const updateWhatsappCallHoursAction = callingAdminActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(callHoursFormSchema)
  .action(
    async ({
      parsedInput,
      bindArgsParsedInputs: [workspaceId, integrationWhatsappId],
    }: {
      parsedInput: CallHoursFormValues
      bindArgsParsedInputs: readonly [string, string]
    }) => {
      const t = await getTranslations()
      // Same gate as the other calling settings: they change how the number
      // behaves for every customer.
      await assertWorkspaceSuperAdmin(workspaceId)
      await updateWhatsappCallHours({
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
