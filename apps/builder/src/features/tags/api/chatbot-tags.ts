import z from "zod"
import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listTags } from "../queries"
import { listTagsRequest, listTagsResponse } from "../schemas/query"

export const listChatbotTagsAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/chatbots/{chatbotId}/tags",
    summary: "List tags",
    tags: ["Tags"],
  })
  .input(
    listTagsRequest.and(
      z.object({
        chatbotId: z.cuid2(),
      }),
    ),
  )
  .use(chatbotAuthMiddleware, (input) => input.chatbotId)
  .output(listTagsResponse)
  .handler(async ({ input }) => {
    return await listTags(input)
  })

export const chatbotTagsAPI = {
  listChatbotTagsAPI,
}

export default chatbotTagsAPI
