"use server"

import { appointmentService } from "@chatbotx.io/business"
import { workspaceIdrequestParams } from "@/features/common/schema"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"
import { appointmentIdRequest } from "../schema/action"

export const deleteAppointmentAction = workspaceActionClientAllowExpired
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(appointmentIdRequest)
  .action(async ({ bindArgsParsedInputs: [workspaceId], parsedInput }) => {
    await appointmentService.deleteAppointmentById({
      workspaceId,
      appointmentId: parsedInput.appointmentId,
    })
  })
