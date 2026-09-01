"use server"

import { appointmentCalendarService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateAppointmentCalendarActiveRequest } from "../schema/action"

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
