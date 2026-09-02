"use server"

import { appointmentCalendarService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClient } from "@/lib/safe-action"
import { createAppointmentCalendarRequest } from "../schema/action"

export const createAppointmentCalendarAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createAppointmentCalendarRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => ({
    id: await appointmentCalendarService.create({
      workspaceId,
      name: parsedInput.name,
    }),
  }))
