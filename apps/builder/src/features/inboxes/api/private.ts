import {
  listAllConnectedInboxesRequest,
  listAllConnectedInboxesResponse,
  listInboxesRequest,
  listInboxesResponse,
} from "@chatbotx.io/business"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listAllConnectedInboxes, listInboxes } from "../queries"

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

  // RPC-only (no `.route()`): the builder inbox store needs the complete
  // connected set, which the paginated `list` caps at 50. Kept off the
  // documented OpenAPI surface so "return everything" is not offered as a
  // public endpoint — the public token API stays paginated.
  listAllInboxesAuthenticatedAPI: authorizedAPI
    .input(listAllConnectedInboxesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listAllConnectedInboxesResponse)
    .handler(async ({ input }) => await listAllConnectedInboxes(input)),
}
