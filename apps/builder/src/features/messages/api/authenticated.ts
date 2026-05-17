import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { findMessage, listMessages } from "../queries"
import {
  findMessageRequest,
  listMessagesRequest,
  listMessagesResponse,
} from "../schema/query"
import { messageResourceWithRelations } from "../schema/resource"

export const messagesAuthenticatedAPI = {
  listMessagesAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/messages",
      summary: "List messages",
      tags: ["Messages"],
    })
    .input(listMessagesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listMessagesResponse)
    .handler(async ({ input }) => await listMessages(input)),

  findMessageAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/messages/{id}",
      summary: "Find message by message id",
      tags: ["Messages"],
    })
    .input(findMessageRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(messageResourceWithRelations)
    .handler(async ({ input }) => await findMessage(input)),
}
