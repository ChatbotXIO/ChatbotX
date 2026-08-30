import { sequenceAnalyticsService } from "@chatbotx.io/analytics"
import {
  getSequenceStepStatsRequest,
  getSequenceStepStatsResponse,
  listSequenceStepContactsRequest,
  listSequenceStepContactsResponse,
} from "@chatbotx.io/analytics/schemas"
import { contactInboxService } from "@chatbotx.io/business"
import type { ChannelType } from "@chatbotx.io/database/partials"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listSequences } from "../queries"
import { listSequencesRequest, listSequencesResponse } from "../schema/action"

export const sequencesPrivateAPI = {
  listSequencesWorkspaceAuthAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/sequences",
      summary: "List sequences",
      tags: ["Sequences"],
    })
    .input(listSequencesRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listSequencesResponse)
    .handler(async ({ input }) => await listSequences(input)),

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
    .handler(
      async ({ input }) =>
        await sequenceAnalyticsService.getStepStats({
          workspaceId: input.workspaceId,
          sequenceId: input.sequenceId,
          stepId: input.stepId,
        }),
    ),

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

      const contactInboxes =
        await contactInboxService.findManyByIds(contactInboxIds)

      const contactMap = new Map(contactInboxes.map((c) => [c.id, c]))
      const pageCount = Math.ceil(totalValue / perPage)

      const data = contactInboxIds.flatMap((contactInboxId) => {
        const eventData = contactEventMap.get(contactInboxId)
        if (!eventData) {
          return []
        }

        const contact = contactMap.get(contactInboxId)
        if (!contact) {
          return []
        }

        const conversationId = contact.conversation?.id
        if (!conversationId) {
          return []
        }

        return [
          {
            contactId: contact.id,
            contactInboxId,
            firstName: contact.contact?.firstName ?? null,
            lastName: contact.contact?.lastName ?? null,
            fullName: contact.contact?.fullName ?? null,
            sourceId: contact.sourceId as string | null,
            avatar: contact.contact?.avatar ?? null,
            channel: contact.channel as ChannelType,
            conversationId,
            errorContent: eventData.errorContent ?? null,
            occurredAt: eventData.occurredAt,
          },
        ]
      })

      return { data, total: totalValue, page, pageCount }
    }),
}
