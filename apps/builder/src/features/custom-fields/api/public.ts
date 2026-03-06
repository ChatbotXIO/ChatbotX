import { chatbotTokenAPI } from "@/orpc"
import { listCustomFields } from "../queries"
import {
  listCustomFieldsRequest,
  listCustomFieldsResponse,
} from "../schemas/query"

const publicCustomFieldsAPI = {
  publicListCustomFieldsAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/public/chatbots/custom-fields",
      summary: "List custom fields",
      tags: ["Custom Fields", "Public APIs"],
    })
    .input(listCustomFieldsRequest)
    .output(listCustomFieldsResponse)
    .handler(async ({ context, input }) => {
      return await listCustomFields({ ...input, chatbotId: context.chatbot.id })
    }),
}

export default publicCustomFieldsAPI
