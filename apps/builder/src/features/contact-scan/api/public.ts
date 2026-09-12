import { possibleErrorsOnListingResource } from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { getContactScanStatus } from "../queries/get-contact-scan-status.query"
import {
  getContactScanStatusPublicRequest,
  getContactScanStatusResponse,
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
}
