import { appointmentReminderService } from "@chatbotx.io/business"
import { possibleErrorsOnListingResource } from "@/lib/orpc/orpc-error-helper"
import { publicListResponse } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  appointmentReminderDispatchPublicResource,
  listAppointmentRemindersPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("appointments")

export const appointmentRemindersPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/appointment-reminders",
      summary: "List appointment reminder dispatches",
      description:
        "Audits reminder dispatch rows for the workspace (pending/sent/cancelled/failed), optionally filtered by status.",
      tags: ["Appointment Reminders"],
    })
    .input(listAppointmentRemindersPublicRequest)
    .output(publicListResponse(appointmentReminderDispatchPublicResource))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      // `workspaceId` is optional on the repository's list input, so it must
      // always be passed explicitly here — omitting it would return dispatch
      // rows across every workspace, not just the caller's.
      const { data, pageCount } =
        await appointmentReminderService.listDispatches({
          workspaceId: context.workspace.id,
          status: input.status,
          page: input.page,
          perPage: input.perPage,
        })
      return { data, pageCount }
    }),
}
