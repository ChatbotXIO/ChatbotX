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

      const {
        contactIds,
        errorContentMap,
        occurredAtMap,
        sourceIdMap,
        channelMap,
        conversationIdMap,
      } = await sequenceAnalyticsService.getContactsFromClickHouse({
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

      return sequenceAnalyticsService.buildContactsResponse({
        contactIds,
        errorContentMap,
        occurredAtMap,
        sourceIdMap,
        channelMap,
        conversationIdMap,
        contactMap,
        total: totalValue,
        page,
        perPage,
      })
    }),
}
