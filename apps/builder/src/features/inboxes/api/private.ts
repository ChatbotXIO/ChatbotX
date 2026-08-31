import { listInboxesRequest, listInboxesResponse } from "@chatbotx.io/business"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listInboxes } from "../queries"

export const inboxesAuthenticatedAPI = {
  listInboxesAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/inboxes",
      summary: "List inboxes",
      tags: ["Inboxes"],
    })
    .input(listInboxesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listInboxesResponse)
    .handler(async ({ input }) => await listInboxes(input)),
}
