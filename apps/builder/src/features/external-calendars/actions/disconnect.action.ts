"use server"

import { appointmentExternalCalendarService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { disconnectGoogleCalendarProvider } from "../lib/google-calendar-provider"

export const disconnectGoogleCalendarAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId, integrationId] }) => {
    const connection =
      await appointmentExternalCalendarService.getGoogleConnectionForProviderCall(
        {
          workspaceId,
          integrationId,
        },
      )

    await appointmentExternalCalendarService.disconnect({
      workspaceId,
      integrationId,
    })
    await disconnectGoogleCalendarProvider({ workspaceId, connection })
  })
