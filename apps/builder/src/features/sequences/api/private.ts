import { sequenceAnalyticsService } from "@chatbotx.io/analytics"
import {
  getSequenceStepStatsRequest,
  getSequenceStepStatsResponse,
  listSequenceStepContactsRequest,
  listSequenceStepContactsResponse,
} from "@chatbotx.io/analytics/schemas"
import { db } from "@chatbotx.io/database/client"
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

      const { contactIds, contactEventMap } =
        await sequenceAnalyticsService.getContactsFromClickHouse({
          workspaceId,
          sequenceId,
          stepId,
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
