import {
  appointmentCalendarService,
  appointmentService,
} from "@chatbotx.io/business"
import {
  possibleErrorsOnCreatingAppointmentCalendar,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingAppointmentCalendar,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListResponse } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createAppointmentCalendarRequest,
  updateAppointmentCalendarRequest,
} from "../schema/action"
import {
  appointmentCalendarAvailabilityPublicResponse,
  appointmentCalendarForEditPublicResource,
  appointmentCalendarIdPublicRequest,
  appointmentCalendarPublicResource,
  createAppointmentCalendarPublicResponse,
  getAppointmentCalendarAvailabilityPublicRequest,
  listAppointmentCalendarsPublicRequest,
  setAppointmentCalendarActivePublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("appointments")

const tags = ["Appointment Calendars"]

export const appointmentCalendarsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/appointment-calendars",
      summary: "List appointment calendars",
      tags,
    })
    .input(listAppointmentCalendarsPublicRequest)
    .output(publicListResponse(appointmentCalendarPublicResource))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { data, pageCount } = await appointmentCalendarService.list({
        ...input,
        workspaceId: context.workspace.id,
      })
      return { data, pageCount }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/appointment-calendars/{id}",
      summary: "Get an appointment calendar",
      description:
        "Returns the calendar's full configuration including its availability intervals and reminders.",
      tags,
    })
    .input(appointmentCalendarIdPublicRequest)
    .output(appointmentCalendarForEditPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await appointmentCalendarService.getForEdit({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/appointment-calendars",
      summary: "Create an appointment calendar",
      description:
        "Creates a new calendar with default settings. Use the update endpoint to configure duration, availability, and reminders.",
      successStatus: 201,
      tags,
    })
    .input(createAppointmentCalendarRequest)
    .output(createAppointmentCalendarPublicResponse)
    .errors(possibleErrorsOnCreatingAppointmentCalendar)
    .handler(async ({ context, input }) => {
      const id = await appointmentCalendarService.create({
        workspaceId: context.workspace.id,
        name: input.name,
      })
      return { id }
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/appointment-calendars/{id}",
      summary: "Update an appointment calendar",
      tags,
    })
    .input(
      updateAppointmentCalendarRequest.and(appointmentCalendarIdPublicRequest),
    )
    .errors(possibleErrorsOnMutatingAppointmentCalendar)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      await appointmentCalendarService.update({
        workspaceId: context.workspace.id,
        id,
        ...data,
        scheduleWindowType: data.scheduleWindowConfig.scheduleWindowType,
      })
    }),

  setActive: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/appointment-calendars/{id}/active",
      summary: "Activate or deactivate an appointment calendar",
      tags,
    })
    .input(
      setAppointmentCalendarActivePublicRequest.and(
        appointmentCalendarIdPublicRequest,
      ),
    )
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await appointmentCalendarService.setActive({
        workspaceId: context.workspace.id,
        id: input.id,
        active: input.active,
      })
    }),

  duplicate: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/appointment-calendars/{id}/duplicate",
      summary: "Duplicate an appointment calendar",
      successStatus: 201,
      tags,
    })
    .input(appointmentCalendarIdPublicRequest)
    .output(createAppointmentCalendarPublicResponse)
    .errors(possibleErrorsOnMutatingAppointmentCalendar)
    .handler(async ({ context, input }) => {
      const id = await appointmentCalendarService.duplicate({
        workspaceId: context.workspace.id,
        id: input.id,
      })
      return { id }
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/appointment-calendars/{id}",
      summary: "Delete an appointment calendar",
      successStatus: 204,
      tags,
    })
    .input(appointmentCalendarIdPublicRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await appointmentCalendarService.deleteMany({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),

  getAvailability: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/appointment-calendars/{id}/availability",
      summary: "Check appointment availability for a calendar",
      description:
        "Returns bookable slots between startDate and endDate, accounting for existing appointments, buffers, and connected external calendars.",
      tags,
    })
    .input(getAppointmentCalendarAvailabilityPublicRequest)
    .output(appointmentCalendarAvailabilityPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await appointmentService.checkAvailability({
          workspaceId: context.workspace.id,
          calendarId: input.id,
          contactId: input.contactId,
          startDate: input.startDate,
          endDate: input.endDate,
        }),
    ),
}
