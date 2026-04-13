import { sequenceAnalyticsService } from "@chatbotx.io/analytics"
import {
  getSequenceStepStatsRequest,
  getSequenceStepStatsResponse,
  listSequenceStepContactsRequest,
  listSequenceStepContactsResponse,
} from "@chatbotx.io/analytics/schemas"
import { db } from "@chatbotx.io/database/client"
import type { ChannelType } from "@chatbotx.io/database/partials"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

export const sequencesPrivateAPI = {
  privateGetSequenceStepStatsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/sequences/{sequenceId}/steps/{stepId}/stats",
      summary: "Get sequence step stats",
      tags: ["Sequences"],
    })
    .input(getSequenceStepStatsRequest)
    .output(getSequenceStepStatsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      return await sequenceAnalyticsService.getStepStats({
        workspaceId: input.workspaceId,
        sequenceId: input.sequenceId,
        stepId: input.stepId,
      })
    }),

  privateListSequenceStepContactsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/sequences/{sequenceId}/steps/{stepId}/contacts",
      summary: "List sequence step contacts by event type",
      tags: ["Sequences"],
    })
    .input(listSequenceStepContactsRequest)
    .output(listSequenceStepContactsResponse)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const {
        workspaceId,
        sequenceId,
        stepId,
        eventType,
        total,
        page,
        perPage,
      } = input
      const totalValue = total || 0

      const { contactInboxIds, contactEventMap } =
        await sequenceAnalyticsService.getContacts({
          workspaceId,
          sequenceId,
          stepId,
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
            conversationId: contact.conversation?.id ?? null,
            errorContent: eventData.errorContent ?? null,
            occurredAt: eventData.occurredAt,
          }
        })
        .filter((c) => c !== null)

      return { data, total: totalValue, page, pageCount }
    }),
}
