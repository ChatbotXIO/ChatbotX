import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  findConversation,
  listConversations,
} from "../queries/list-conversations.query"
import { listConversationsRequest } from "../schema/query"
import {
  findConversationRequest,
  findConversationResponse,
  listConversationsResponse,
} from "../schema/resource"

export const conversationsAuthenticatedAPI = {
  listConversationsAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/conversations",
      summary: "Listar conversas com paginação por cursor",
      tags: ["Conversas"],
    })
    .input(listConversationsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listConversationsResponse)
    .handler(async ({ input }) => await listConversations(input)),

  listConversationsByPOSTAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/conversations/list",
      summary: "Listar conversas com paginação por cursor via POST",
      tags: ["Conversas"],
    })
    .input(listConversationsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listConversationsResponse)
    .handler(async ({ input }) => await listConversations(input)),

  findConversationAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/conversations/{id}",
      summary: "Buscar conversa pelo ID",
      tags: ["Conversas"],
    })
    .input(findConversationRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(findConversationResponse)
    .handler(async ({ input }) => await findConversation(input)),
}
