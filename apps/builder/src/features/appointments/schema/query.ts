import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { contactAppointmentResource } from "./resource"

export const listContactAppointmentsRequest = withWorkspaceIdSchema.and(
  z.object({
    contactId: zodBigintAsString(),
  }),
)

export const listContactAppointmentsResponse = z.array(
  contactAppointmentResource,
)

export type ListContactAppointmentsResponse = z.infer<
  typeof listContactAppointmentsResponse
>
