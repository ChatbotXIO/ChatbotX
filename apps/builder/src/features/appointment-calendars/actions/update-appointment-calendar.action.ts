"use server"

import { appointmentCalendarService } from "@chatbotx.io/business"
import { workspaceIdAndIdRequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { updateAppointmentCalendarRequest } from "../schema/action"

export const updateAppointmentCalendarAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .inputSchema(updateAppointmentCalendarRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    await appointmentCalendarService.update({
      workspaceId,
      id,
      ...parsedInput,
      scheduleWindowType: parsedInput.scheduleWindowConfig.scheduleWindowType,
    })
  })
