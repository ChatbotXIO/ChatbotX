import { appointmentService } from "@chatbotx.io/business"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  listContactAppointmentsRequest,
  listContactAppointmentsResponse,
} from "../schemas/query"

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
    .handler(
      async ({ input }) =>
        await appointmentService.listContactAppointments(input),
    ),
}
