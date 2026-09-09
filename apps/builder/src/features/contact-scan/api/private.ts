import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { requireUnrestrictedContactsScope } from "../lib/require-unrestricted-contacts-scope"
import { getContactScanStatus } from "../queries/get-contact-scan-status.query"
import {
  getContactScanStatusRequest,
  getContactScanStatusResponse,
} from "../schema/query"

export const contactScanAuthenticatedAPI = {
  getContactScanStatusAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contact-scans/status",
      summary: "Get the latest Automatic Customer Scan status for an inbox",
      tags: ["Contacts"],
    })
    .input(getContactScanStatusRequest)
    .output(getContactScanStatusResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      // An assigned-only member must not read a Page-wide scan's
      // counts/errors (plan §7 decision 10) — same gate as the schedule
      // action.
      await requireUnrestrictedContactsScope(input.workspaceId)
      return await getContactScanStatus(input)
    }),
}
