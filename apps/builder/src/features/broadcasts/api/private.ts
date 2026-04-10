import { broadcastAnalyticsService } from "@chatbotx.io/analytics"
import {
  getBroadcastStatsRequest,
  getBroadcastStatsResponse,
  listBroadcastContactsRequest,
  listBroadcastContactsResponse,
} from "@chatbotx.io/analytics/schemas"
import { db } from "@chatbotx.io/database/client"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

export const broadcastPrivateAPIs = {
  privateGetBroadcastStatsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/broadcasts/{broadcastId}/stats",
      summary: "Get broadcast stats",
      tags: ["Broadcasts"],
    })
    .input(getBroadcastStatsRequest)
    .output(getBroadcastStatsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      return await broadcastAnalyticsService.getStats({
        workspaceId: input.workspaceId,
        broadcastId: input.broadcastId,
      })
    }),

  privateListBroadcastContactsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/broadcasts/{broadcastId}/contacts",
      summary: "List broadcast contacts by event type",
      tags: ["Broadcasts"],
    })
    .input(listBroadcastContactsRequest)
    .output(listBroadcastContactsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { workspaceId, broadcastId, eventType, total, page, perPage } =
        input
      const totalValue = total || 0

      const { contactIds, contactEventMap } =
        await broadcastAnalyticsService.getContactsFromClickHouse({
          workspaceId,
          broadcastId,
          eventType,
          page,
          perPage,
        })

      if (contactIds.length === 0) {
        return {
          data: [],
          total: totalValue,
          page,
          pageCount: Math.ceil(totalValue / perPage),
        }
      }

      const contacts = await db.query.contactModel.findMany({
        where: {
          workspaceId,
          id: { in: contactIds },
        },
        columns: {
          id: true,
          firstName: true,
          lastName: true,
          avatar: true,
        },
      })

      const contactMap = new Map(contacts.map((c) => [c.id, c]))
      const pageCount = Math.ceil(totalValue / perPage)

      const data = contactIds
        .map((contactId) => {
          const contact = contactMap.get(contactId)
          const eventData = contactEventMap.get(contactId)
          if (!(contact && eventData?.conversationId && eventData.channel)) {
            return null
          }
          return {
            contactId: contact.id,
            firstName: contact.firstName,
            lastName: contact.lastName,
            sourceId: eventData.sourceId ?? null,
            avatar: contact.avatar,
            channel: eventData.channel,
            conversationId: eventData.conversationId,
            errorContent: eventData.errorContent ?? null,
            occurredAt: eventData.occurredAt,
          }
        })
        .filter((c) => c !== null)

      return { data, total: totalValue, page, pageCount }
    }),
}

export default broadcastPrivateAPIs
