import { contactScanService } from "@chatbotx.io/business"
import {
  possibleErrorsOnListingResource,
  possibleErrorsOnSchedulingContactScan,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listContactScanHistoryRows } from "../lib/contact-scan-history"
import { getContactScanStatus } from "../lib/get-contact-scan-status"
import {
  getContactScanStatusPublicRequest,
  getContactScanStatusResponse,
  listContactScansPublicRequest,
  listContactScansPublicResponse,
  scheduleContactScanPublicRequest,
  scheduleContactScanPublicResponse,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("contacts")

export const contactScanPublicRouter = {
  getStatus: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contact-scans/status",
      summary: "Get the latest Automatic Customer Scan status for an inbox",
      tags: ["Contacts"],
    })
    .input(getContactScanStatusPublicRequest)
    .output(getContactScanStatusResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await getContactScanStatus({
          workspaceId: context.workspace.id,
          inboxId: input.inboxId,
        }),
    ),

  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/contact-scans",
      summary: "List Automatic Customer Scan runs for the workspace",
      tags: ["Contacts"],
    })
    .input(listContactScansPublicRequest)
    .output(listContactScansPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await listContactScanHistoryRows({
          workspaceId: context.workspace.id,
          page: input.page,
          perPage: input.perPage,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/contact-scans",
      summary: "Schedule an Automatic Customer Scan for an inbox",
      description:
        "Starts a scan that walks the inbox's existing conversations and imports contacts that never messaged first. `scanFromAt` must be in the past. Only one scan may run per inbox, with a cooldown between runs — both are rejected with 409.",
      successStatus: 202,
      tags: ["Contacts"],
    })
    .input(scheduleContactScanPublicRequest)
    .output(scheduleContactScanPublicResponse)
    .errors(possibleErrorsOnSchedulingContactScan)
    .handler(
      async ({ context, input }) =>
        await contactScanService.schedule({
          workspaceId: context.workspace.id,
          inboxId: input.inboxId,
          // A workspace token has no session user; the column is nullable.
          requestedByUserId: null,
          scanFromAt: input.scanFromAt,
        }),
    ),
}
