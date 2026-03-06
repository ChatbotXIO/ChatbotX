import { withChatbotIdSchema } from "@/features/chatbots/schemas/resource"
import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listCustomFields } from "../queries"
import {
  listCustomFieldsRequest,
  listCustomFieldsResponse,
} from "../schemas/query"

export const privateCustomFieldsAPI = {
  privateListCustomFieldsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/custom-fields",
      summary: "List custom fields",
      tags: ["Custom Fields", "Private APIs"],
    })
    .input(listCustomFieldsRequest.and(withChatbotIdSchema))
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .output(listCustomFieldsResponse)
    .handler(async ({ context, input }) => {
      return await listCustomFields({ ...input, chatbotId: context.chatbot.id })
    }),
}

export default privateCustomFieldsAPI
