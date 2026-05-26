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
      summary: "Listar mensagens",
      tags: ["Mensagens"],
    })
    .input(listMessagesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listMessagesResponse)
    .handler(async ({ input }) => await listMessages(input)),

  findMessageAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/messages/{id}",
      summary: "Buscar mensagem pelo ID",
      tags: ["Mensagens"],
    })
    .input(findMessageRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(messageResourceWithRelations)
    .handler(async ({ input }) => await findMessage(input)),
}
