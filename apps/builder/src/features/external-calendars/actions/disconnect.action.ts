"use server"

import { appointmentExternalCalendarService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

export const disconnectGoogleCalendarAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId, integrationId] }) => {
    await appointmentExternalCalendarService.disconnect({
      workspaceId,
      integrationId,
    })
  })
