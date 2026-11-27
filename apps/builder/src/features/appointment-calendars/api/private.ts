import {
  appointmentCalendarService,
  appointmentService,
} from "@chatbotx.io/business"
import { requireContactAccessForMember } from "@/features/contacts/permissions"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  getContactAvailabilityRequest,
  getContactAvailabilityResponse,
  listAppointmentCalendarsForFlowRequest,
  listAppointmentCalendarsForFlowResponse,
} from "../schema/query"

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

  getContactAvailabilityAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/appointment-calendars/{calendarId}/availability",
      summary: "Get calendar availability for a contact",
      tags: ["Appointment Calendars"],
    })
    .input(getContactAvailabilityRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(getContactAvailabilityResponse)
    .handler(async ({ input, context }) => {
      await requireContactAccessForMember({
        permissions: context.workspaceMember.permissions,
        userId: context.user.id,
        workspaceId: input.workspaceId,
        contactId: input.contactId,
      })
      // Same service the public appointmentCalendars.getAvailability calls.
      const { timezone, slots } = await appointmentService.checkAvailability({
        workspaceId: input.workspaceId,
        calendarId: input.calendarId,
        contactId: input.contactId,
        startDate: input.startDate,
        endDate: input.endDate,
      })
      return { timezone, slots }
    }),
}
