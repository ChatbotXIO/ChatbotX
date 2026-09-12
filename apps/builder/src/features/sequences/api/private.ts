import { sequenceAnalyticsService } from "@chatbotx.io/analytics"
import {
  getSequenceStepStatsRequest,
  getSequenceStepStatsResponse,
  listSequenceStepContactsRequest,
  listSequenceStepContactsResponse,
} from "@chatbotx.io/analytics/schemas"
import { sequenceService } from "@chatbotx.io/business/sequence"
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
      const { workspaceId, sequenceId, stepId, eventType, page, perPage } =
        input

      const {
        data,
        total: totalValue,
        pageCount,
      } = await sequenceService.listStepContactsPage({
        workspaceId,
        sequenceId,
        stepId,
        eventType,
        page,
        perPage,
      })

      return { data, total: totalValue, page, pageCount }
    }),
}
