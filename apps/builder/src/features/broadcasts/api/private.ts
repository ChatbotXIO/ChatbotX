import { broadcastAnalyticsService } from "@chatbotx.io/analytics"
import {
  getBroadcastStatsResponse,
  listBroadcastContactsRequest,
  listBroadcastContactsResponse,
} from "@chatbotx.io/analytics/schemas"
import { broadcastService, contactInboxService } from "@chatbotx.io/business"
import { type ChannelType, channelTypes } from "@chatbotx.io/database/partials"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

const selectOptionResource = z.object({
  id: z.string(),
  name: z.string(),
})

const listBroadcastOptionsRequest = z.object({
  workspaceId: z.string(),
  channel: channelTypes,
})

const listBroadcastOptionsResponse = z.object({
  data: z.array(selectOptionResource),
})

const getBatchBroadcastStatsRequest = z.object({
  workspaceId: z.string(),
  broadcastIds: z.array(z.string()),
})

const getBatchBroadcastStatsResponse = z.record(
  z.string(),
  getBroadcastStatsResponse,
)

const getBroadcastTemplateDetailRequest = z.object({
  workspaceId: z.string(),
  broadcastId: z.string(),
})

const broadcastTemplateDetailResponse = z
  .discriminatedUnion("channel", [
    z.object({
      channel: z.literal("whatsapp"),
      id: z.string(),
      name: z.string(),
      language: z.string(),
      category: z.string(),
      status: z.string(),
      components: z.unknown(),
      integrationName: z.string().nullable(),
    }),
    z.object({
      channel: z.literal("messenger"),
      id: z.string(),
      name: z.string(),
      language: z.string(),
      category: z.string(),
      status: z.string(),
      parameterFormat: z.string(),
      components: z.unknown(),
      integrationName: z.string().nullable(),
    }),
  ])
  .nullable()

export const broadcastPrivateAPIs = {
  privateListBroadcastOptionsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/broadcasts/options",
      summary: "List broadcast options",
      tags: ["Broadcasts"],
    })
    .input(listBroadcastOptionsRequest)
    .output(listBroadcastOptionsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => ({
      data: await broadcastService.listOptions(input),
    })),

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

  privateGetBroadcastTemplateDetailAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/broadcasts/{broadcastId}/template-detail",
      summary: "Get broadcast template detail",
      tags: ["Broadcasts"],
    })
    .input(getBroadcastTemplateDetailRequest)
    .output(broadcastTemplateDetailResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(
      async ({ input }) => await broadcastService.getTemplateDetail(input),
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

      const contactInboxes =
        await contactInboxService.findManyByIds(contactInboxIds)

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
            fullName: contactInbox.contact.fullName ?? null,
            sourceId: contactInbox.sourceId,
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
