import { broadcastAnalyticsService } from "@chatbotx.io/analytics"
import {
  getBroadcastStatsResponse,
  listBroadcastContactsRequest,
  listBroadcastContactsResponse,
} from "@chatbotx.io/analytics/schemas"
import { db } from "@chatbotx.io/database/client"
import type { ChannelType } from "@chatbotx.io/database/partials"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

const getBatchBroadcastStatsRequest = z.object({
  workspaceId: z.string(),
  broadcastIds: z.array(z.string()),
})

const getBatchBroadcastStatsResponse = z.record(
  z.string(),
  getBroadcastStatsResponse,
)

export const broadcastPrivateAPIs = {
  privateGetBatchBroadcastStatsAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/broadcasts/stats",
      summary: "Get batch broadcast stats",
      tags: ["Broadcasts"],
    })
    .input(getBatchBroadcastStatsRequest)
    .output(getBatchBroadcastStatsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(
      async ({ input }) =>
        await broadcastAnalyticsService.getBatchStats({
          workspaceId: input.workspaceId,
          broadcastIds: input.broadcastIds,
        }),
    ),

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

          const contactInbox = contactMap.get(contactInboxId)
          if (!contactInbox) {
            return null
          }
          return {
            contactId: contactInbox.id,
            contactInboxId,
            firstName: contactInbox.contact.firstName ?? null,
            lastName: contactInbox.contact.lastName ?? null,
            sourceId: contactInbox.sourceId ?? null,
            avatar: contactInbox.contact.avatar ?? null,
            channel: contactInbox.channel as ChannelType,
            conversationId: contactInbox.conversation?.id ?? "",
            errorContent: eventData.errorContent ?? null,
            occurredAt: eventData.occurredAt,
          }
        })
        .filter((c) => c !== null)

      return { data, total: totalValue, page, pageCount }
    }),
}

export default broadcastPrivateAPIs
