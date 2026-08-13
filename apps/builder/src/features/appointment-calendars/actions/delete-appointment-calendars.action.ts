"use server"

import { appointmentCalendarService } from "@chatbotx.io/business"
import {
  bulkUpdateIdsRequest,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteAppointmentCalendarsAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    await appointmentCalendarService.deleteMany({
      workspaceId,
      ids: parsedInput.ids,
    })
  })
