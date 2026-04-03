import { chatbotTokenAPI } from "@/orpc"
import { getAgents } from "../queries"
import { listChatbotMembersRequest } from "../schemas/get-chatbot-members.request"
import { publicListChatbotMembersResponse } from "../schemas/resource"

export const chatbotMembersAPIs = {
  listChatbotMembersChatbotTokenAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/v1/chatbot-members",
      summary: "List chatbot members",
      tags: ["Chatbot Members"],
    })
    .input(listChatbotMembersRequest)
    .output(publicListChatbotMembersResponse)
    .handler(async ({ context, input }) => {
      return await getAgents({
        ...input,
        chatbotId: context.chatbot.id,
      })
    }),
}

export default chatbotMembersAPIs
