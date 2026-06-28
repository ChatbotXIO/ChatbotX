import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listMessengerPersonaOptions } from "../queries"
import {
  listMessengerPersonasRequest,
  listMessengerPersonasResponse,
} from "../schemas/query"

export const personasAuthenticatedAPI = {
  listMessengerPersonasAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/messenger-personas",
      summary: "List Messenger personas across the workspace's pages",
      tags: ["Personas"],
    })
    .input(listMessengerPersonasRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listMessengerPersonasResponse)
    .handler(async ({ input }) => await listMessengerPersonaOptions(input)),
}

export default personasAuthenticatedAPI
