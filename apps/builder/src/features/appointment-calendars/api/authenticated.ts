import { appointmentCalendarService } from "@chatbotx.io/business"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  listAppointmentCalendarsForFlowRequest,
  listAppointmentCalendarsForFlowResponse,
} from "../schemas/query"

export const appointmentCalendarsAuthenticatedAPI = {
  listAppointmentCalendarsForFlowAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/appointment-calendars/for-flow",
      summary: "List appointment calendars for flow",
      tags: ["Appointment Calendars"],
    })
    .input(listAppointmentCalendarsForFlowRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listAppointmentCalendarsForFlowResponse)
    .handler(
      async ({ input }) => await appointmentCalendarService.listForFlow(input),
    ),
}
