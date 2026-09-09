import { appointmentExternalCalendarService } from "@chatbotx.io/business"
import {
  possibleErrorsOnDisconnectingExternalCalendar,
  possibleErrorsOnListingResource,
} from "@/lib/orpc/orpc-error-helper"
import { paginateInMemory, publicListRequest } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  appointmentExternalCalendarIdPublicRequest,
  listAppointmentExternalCalendarsPublicResponse,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("appointments")

const tags = ["Appointment External Calendars"]

export const appointmentExternalCalendarsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/appointment-external-calendars",
      summary: "List connected external calendars",
      description:
        "Lists Google/Outlook calendar connections available to attach to an appointment calendar, with a count of calendars currently using each connection.",
      tags,
    })
    .input(publicListRequest)
    .output(listAppointmentExternalCalendarsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const items =
        await appointmentExternalCalendarService.listWithConnectedCount({
          workspaceId: context.workspace.id,
        })
      // `listWithConnectedCount` is not paginated at the query layer (small,
      // per-workspace, bounded by how many calendar integrations a workspace
      // connects) — see `paginateInMemory`'s doc comment in
      // `@/lib/public-api/list` for why this is the sanctioned temporary
      // pattern rather than a new repository-level pagination path.
      return paginateInMemory(items, input)
    }),

  disconnect: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/appointment-external-calendars/{integrationId}",
      summary: "Disconnect an external calendar",
      description:
        "Disconnects a Google/Outlook calendar connection. Fails if any appointment calendar is still using it.",
      successStatus: 204,
      tags,
    })
    .input(appointmentExternalCalendarIdPublicRequest)
    .errors(possibleErrorsOnDisconnectingExternalCalendar)
    .handler(async ({ context, input }) => {
      await appointmentExternalCalendarService.disconnect({
        workspaceId: context.workspace.id,
        integrationId: input.integrationId,
      })
    }),
}
