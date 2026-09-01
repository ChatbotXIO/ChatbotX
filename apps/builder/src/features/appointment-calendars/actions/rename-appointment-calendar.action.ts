"use server"

import { appointmentCalendarService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { renameAppointmentCalendarRequest } from "../schema/action"

export const renameAppointmentCalendarAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(renameAppointmentCalendarRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    await appointmentCalendarService.rename({
      workspaceId,
      id,
      name: parsedInput.name,
    })
  })
