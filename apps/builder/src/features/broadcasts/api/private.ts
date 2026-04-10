import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { getBroadcastStats } from "../queries/get-broadcast-stats.query"
import { listBroadcastContacts } from "../queries/list-broadcast-contacts.query"
import {
  listBroadcastContactsRequest,
  listBroadcastContactsResponse,
} from "../schemas/broadcast-contacts"
import {
  getBroadcastStatsRequest,
  getBroadcastStatsResponse,
} from "../schemas/broadcast-stats"

export const broadcastPrivateAPIs = {
  privateGetBroadcastStatsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/broadcasts/{broadcastId}/stats",
      summary: "Get broadcast stats",
      tags: ["Broadcasts"],
    })
    .input(getBroadcastStatsRequest)
    .output(getBroadcastStatsResponse)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .handler(async ({ input }) => {
      return await getBroadcastStats({
        chatbotId: input.chatbotId,
        broadcastId: input.broadcastId,
      })
    }),

  privateListBroadcastContactsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/broadcasts/{broadcastId}/contacts",
      summary: "List broadcast contacts by event type",
      tags: ["Broadcasts"],
    })
    .input(listBroadcastContactsRequest)
    .output(listBroadcastContactsResponse)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .handler(async ({ input }) => {
      return await listBroadcastContacts({
        chatbotId: input.chatbotId,
        broadcastId: input.broadcastId,
        eventType: input.eventType,
        page: input.page,
        perPage: input.perPage,
      })
    }),
}

export default broadcastPrivateAPIs
