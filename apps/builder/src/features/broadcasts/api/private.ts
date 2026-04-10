import { broadcastAnalyticsService } from "@chatbotx.io/analytics"
import {
  getBroadcastStatsRequest,
  getBroadcastStatsResponse,
  listBroadcastContactsRequest,
  listBroadcastContactsResponse,
} from "@chatbotx.io/analytics/schemas"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
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

      const { contactIds, errorContentMap, occurredAtMap } =
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
        with: {
          contactInboxes: {
            columns: {
              contactId: true,
              inboxId: true,
              channel: true,
              sourceId: true,
            },
          },
        },
      })

      const conversations = await db
        .select({
          id: conversationModel.id,
          contactId: conversationModel.contactId,
        })
        .from(conversationModel)
        .where(
          and(
            inArray(conversationModel.contactId, contactIds),
            eq(conversationModel.workspaceId, workspaceId),
          ),
        )

      const contactMap = new Map(
        contacts.map((c) => [
          c.id,
          {
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            sourceId: c.contactInboxes[0]?.sourceId,
            avatar: c.avatar,
            channel: c.contactInboxes[0]?.channel,
          },
        ]),
      )
      const conversationMap = new Map(
        conversations.map((c) => [c.contactId, c.id]),
      )

      return broadcastAnalyticsService.buildContactsResponse({
        contactIds,
        errorContentMap,
        occurredAtMap,
        contactMap,
        conversationMap,
        total: totalValue,
        page,
        perPage,
      })
    }),
}

export default broadcastPrivateAPIs
