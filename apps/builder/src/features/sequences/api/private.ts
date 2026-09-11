import { sequenceAnalyticsService } from "@chatbotx.io/analytics"
import {
  getSequenceStepStatsRequest,
  getSequenceStepStatsResponse,
  listSequenceStepContactsRequest,
  listSequenceStepContactsResponse,
} from "@chatbotx.io/analytics/schemas"
import { contactInboxService } from "@chatbotx.io/business"
import { mapStatsContactRow } from "@/features/common/lib/map-stats-contact-row"
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

      const contactInboxes = await contactInboxService.findManyByIds({
        workspaceId,
        ids: contactInboxIds,
      })

      const contactMap = new Map(contactInboxes.map((c) => [c.id, c]))
      const pageCount = Math.ceil(totalValue / perPage)

      // Shared with the broadcasts private/public "stats contacts" routes —
      // `contactId` must be the real Contact id (`eventData.contactId`), not
      // the ContactInbox id, because both feed the same `StatsContactsDialog`
      // → `addContactTagAction`/`bulkTagStatsContactsAction` path, which tags
      // by Contact id.
      const data = contactInboxIds.flatMap((contactInboxId) => {
        const contactInbox = contactMap.get(contactInboxId)
        const conversationId = contactInbox?.conversation?.id
        if (!conversationId) {
          return []
        }

        const row = mapStatsContactRow(
          contactInboxId,
          contactEventMap.get(contactInboxId),
          contactInbox,
        )
        if (!row) {
          return []
        }

        return [{ ...row, conversationId }]
      })

      return { data, total: totalValue, page, pageCount }
    }),
}
