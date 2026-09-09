import {
  appointmentService,
  resolveTenantSettings,
} from "@chatbotx.io/business"
import {
  possibleErrorsOnBookingAppointment,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListResponse } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  appointmentIdPublicRequest,
  appointmentListItemPublicResource,
  appointmentPublicResource,
  bookAppointmentPublicRequest,
  listAppointmentsPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("appointments")

const tags = ["Appointments"]

export const appointmentsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/appointments",
      summary: "List appointments",
      description:
        "Lists appointments in the workspace, optionally filtered by calendar and tab (next/past).",
      tags,
    })
    .input(listAppointmentsPublicRequest)
    .output(publicListResponse(appointmentListItemPublicResource))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { appUrl } = await resolveTenantSettings({
        workspaceId: context.workspace.id,
      })
      const { data, pageCount } = await appointmentService.list({
        workspaceId: context.workspace.id,
        calendarId: input.calendarId,
        tab: input.tab,
        search: input.search,
        page: input.page,
        perPage: input.perPage,
        appUrl,
      })
      return { data, pageCount }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/appointments/{id}",
      summary: "Get an appointment by id",
      tags,
    })
    .input(appointmentIdPublicRequest)
    .output(appointmentPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await appointmentService.findByOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  book: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/appointments",
      summary: "Book an appointment",
      description:
        "Books a slot on a calendar for a contact. Runs the same availability, capacity, and daily-limit checks as the booking webview, and schedules reminders/confirmation flow if configured on the calendar.",
      successStatus: 201,
      tags,
    })
    .input(bookAppointmentPublicRequest)
    .output(appointmentPublicResource)
    .errors(possibleErrorsOnBookingAppointment)
    .handler(
      async ({ context, input }) =>
        await appointmentService.bookAppointment({
          workspaceId: context.workspace.id,
          calendarId: input.calendarId,
          contactId: input.contactId,
          conversationId: input.conversationId,
          startAt: input.startAt,
          inviteeTimezone: input.inviteeTimezone,
        }),
    ),

  cancel: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/appointments/{id}/cancel",
      summary: "Cancel an appointment",
      tags,
    })
    .input(appointmentIdPublicRequest)
    .output(appointmentPublicResource)
    .errors(possibleErrorsOnBookingAppointment)
    .handler(
      async ({ context, input }) =>
        await appointmentService.cancelAppointmentById({
          workspaceId: context.workspace.id,
          appointmentId: input.id,
        }),
    ),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/appointments/{id}",
      summary: "Delete an appointment",
      description:
        "Soft-deletes an appointment. Upcoming scheduled appointments must be cancelled first.",
      successStatus: 204,
      tags,
    })
    .input(appointmentIdPublicRequest)
    .errors(possibleErrorsOnBookingAppointment)
    .handler(async ({ context, input }) => {
      await appointmentService.deleteAppointmentById({
        workspaceId: context.workspace.id,
        appointmentId: input.id,
      })
    }),
}
