import { broadcastAnalyticsService } from "@chatbotx.io/analytics"
import {
  getBroadcastStatsRequest,
  getBroadcastStatsResponse,
  listBroadcastContactsRequest,
  listBroadcastContactsResponse,
} from "@chatbotx.io/analytics/schemas"
import { db } from "@chatbotx.io/database/client"
import type { ChannelType } from "@chatbotx.io/database/partials"
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
      const totalValue = total ?? 0

      if (!eventType) {
        return { data: [], total: totalValue, page, pageCount: 0 }
      }

      const { contactInboxIds, contactEventMap } =
        await broadcastAnalyticsService.getContacts({
          workspaceId,
          broadcastId,
          eventType,
          page,
          perPage,
        })

      if (contactInboxIds.length === 0) {
        return {
          data: [],
          total: totalValue,
          page,
          pageCount: Math.ceil(totalValue / perPage),
        }
      }

      const contactInboxes = await db.query.contactInboxModel.findMany({
        where: {
          id: { in: contactInboxIds },
        },
        columns: {
          id: true,
          contactId: true,
          sourceId: true,
          channel: true,
        },
        with: {
          contact: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          conversation: {
            columns: {
              id: true,
            },
          },
        },
      })

      const contactMap = new Map(contactInboxes.map((c) => [c.id, c]))
      const pageCount = Math.ceil(totalValue / perPage)

      const data = contactInboxIds
        .map((contactInboxId) => {
          const eventData = contactEventMap.get(contactInboxId)
          if (!eventData) {
            return null
          }

          const contact = contactMap.get(contactInboxId)
          if (!contact) {
            return null
          }
          return {
            contactId: contact.id,
            contactInboxId,
            firstName: contact.contact?.firstName ?? null,
            lastName: contact.contact?.lastName ?? null,
            sourceId: contact.sourceId ?? null,
            avatar: contact.contact?.avatar ?? null,
            channel: contact.channel as ChannelType,
            conversationId: contact.conversation?.id ?? "",
            errorContent: eventData.errorContent ?? null,
            occurredAt: eventData.occurredAt,
          }
        })
        .filter((c) => c !== null)

      return { data, total: totalValue, page, pageCount }
    }),
}

export default broadcastPrivateAPIs
