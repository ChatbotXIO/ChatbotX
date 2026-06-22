import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { getPostDetailsQuery } from "../queries/get-post-details.query"
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

const facebookPostDetailsSchema = z.object({
  message: z.string().optional(),
  full_picture: z.string().optional(),
  from: z.object({ id: z.string(), name: z.string() }).optional(),
  created_time: z.string(),
})

export const conversationsAuthenticatedAPI = {
  listConversationsAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/conversations",
      summary: "List conversations by cursor pagination",
      tags: ["Conversations"],
    })
    .input(listConversationsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listConversationsResponse)
    .handler(async ({ input }) => await listConversations(input)),

  listConversationsByPOSTAuthenticatedAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/conversations/list",
      summary: "List conversations by cursor pagination using POST request",
      tags: ["Conversations"],
    })
    .input(listConversationsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listConversationsResponse)
    .handler(async ({ input }) => await listConversations(input)),

  findConversationAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/conversations/{id}",
      summary: "Find conversation by conversation id",
      tags: ["Conversations"],
    })
    .input(findConversationRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(findConversationResponse)
    .handler(async ({ input }) => await findConversation(input)),

  getPostDetailsAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/conversations/post-details",
      summary: "Get Facebook post details for a comment conversation",
      tags: ["Conversations"],
    })
    .input(
      z.object({
        workspaceId: zodBigintAsString(),
        inboxId: z.string(),
        postId: z.string(),
      }),
    )
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(facebookPostDetailsSchema)
    .handler(async ({ input }) =>
      getPostDetailsQuery(input.inboxId, input.postId),
    ),
}
