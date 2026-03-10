import { chatbotTokenAPI } from "@/orpc"
import { listBroadcasts } from "../queries"
import { publicListBroadcastsResponse } from "../schemas/query"

export const broadcastChatbotTokenAPIs = {
  listBroadcastsChatbotTokenAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts",
      summary: "Get all broadcasts",
      tags: ["Broadcasts"],
    })
    .output(publicListBroadcastsResponse)
    .handler(async ({ context }) => {
      const { data } = await listBroadcasts({
        chatbotId: context.chatbot.id,
        page: 1,
        perPage: 100,
        sort: [{ id: "createdAt", desc: true }],
        name: null,
      })

      return { data }
    }),
}
