"use server"

import { appointmentExternalCalendarService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { verifyGoogleCalendarId } from "../lib/google-calendar-provider"
import { updateExternalCalendarIdRequest } from "../schemas/action"

export const updateGoogleCalendarIdAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(updateExternalCalendarIdRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId, integrationId],
      parsedInput,
    }) => {
      const verified = await verifyGoogleCalendarId({
        workspaceId,
        integrationId,
        providerCalendarId: parsedInput.providerCalendarId,
      })

      await appointmentExternalCalendarService.updateGoogleCalendarId({
        workspaceId,
        integrationId,
        providerCalendarId: verified.providerCalendarId,
        email: verified.email ?? null,
      })
    },
  )
