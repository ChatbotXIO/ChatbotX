"use server"

import { appointmentCalendarService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"

export const duplicateAppointmentCalendarAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id] }) => ({
    id: await appointmentCalendarService.duplicate({
      workspaceId,
      id,
    }),
  }))
