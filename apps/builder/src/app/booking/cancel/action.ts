"use server"

import { appointmentService } from "@chatbotx.io/business"
import { verifyAppointmentCancelToken } from "@chatbotx.io/encryption"
import { cancelBookingRequestSchema } from "@/features/booking-webview/schemas/action"
import { actionClient } from "@/lib/safe-action"

export const cancelBookingAction = actionClient
  .inputSchema(cancelBookingRequestSchema)
  .action(async ({ parsedInput }) => {
    const tokenPayload = await verifyAppointmentCancelToken(parsedInput.token)
    return await appointmentService.cancelAppointmentByToken(tokenPayload)
  })
