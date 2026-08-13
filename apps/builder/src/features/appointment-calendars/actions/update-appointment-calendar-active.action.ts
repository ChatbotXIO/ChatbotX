"use server"

import { appointmentCalendarService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateAppointmentCalendarActiveRequest } from "../schemas/action"

export const updateAppointmentCalendarActiveAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(updateAppointmentCalendarActiveRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    await appointmentCalendarService.setActive({
      workspaceId,
      id,
      active: parsedInput.active,
    })
  })
