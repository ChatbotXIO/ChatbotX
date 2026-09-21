import { appointmentService } from "@chatbotx.io/business"
import { requireContactAccessForMember } from "@/features/contacts/permissions"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  listContactAppointmentsRequest,
  listContactAppointmentsResponse,
} from "../schema/query"

const tags = ["Appointments"]

export const appointmentsAuthenticatedAPI = {
  listContactAppointmentsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts/{contactId}/appointments",
      summary: "List appointments for a contact",
      tags,
    })
    .input(listContactAppointmentsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listContactAppointmentsResponse)
    .handler(async ({ input, context }) => {
      await requireContactAccessForMember({
        permissions: context.workspaceMember.permissions,
        userId: context.user.id,
        workspaceId: input.workspaceId,
        contactId: input.contactId,
      })

      return await appointmentService.listContactAppointments(input)
    }),
}
