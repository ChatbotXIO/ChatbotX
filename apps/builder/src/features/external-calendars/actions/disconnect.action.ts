"use server"

import { appointmentExternalCalendarService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const disconnectGoogleCalendarAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId, integrationId] }) => {
    await appointmentExternalCalendarService.disconnect({
      workspaceId,
      integrationId,
    })
  })
