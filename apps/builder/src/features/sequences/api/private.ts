import { sequenceAnalyticsService } from "@chatbotx.io/analytics"
import {
  getSequenceStepStatsRequest,
  getSequenceStepStatsResponse,
  listSequenceStepContactsRequest,
  listSequenceStepContactsResponse,
} from "@chatbotx.io/analytics/schemas"
import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
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

      const { contactIds, errorContentMap, occurredAtMap } =
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

      return sequenceAnalyticsService.buildContactsResponse({
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
