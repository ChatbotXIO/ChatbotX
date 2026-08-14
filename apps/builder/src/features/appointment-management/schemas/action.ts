import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const appointmentIdRequest = z.object({
  appointmentId: zodBigintAsString(),
})
export type AppointmentIdRequest = z.infer<typeof appointmentIdRequest>
