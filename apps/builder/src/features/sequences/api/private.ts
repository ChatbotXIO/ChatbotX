import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { getSequenceStepStats } from "../queries/get-sequence-step-stats.query"
import { listSequenceStepContacts } from "../queries/list-sequence-step-contacts.query"
import {
  getSequenceStepStatsRequest,
  getSequenceStepStatsResponse,
  listSequenceStepContactsRequest,
  listSequenceStepContactsResponse,
} from "../schema"

export const sequencesPrivateAPI = {
  privateGetSequenceStepStatsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/sequences/{sequenceId}/steps/{stepId}/stats",
      summary: "Get sequence step stats",
      tags: ["Sequences"],
    })
    .input(getSequenceStepStatsRequest)
    .output(getSequenceStepStatsResponse)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .handler(async ({ input }) => {
      return await getSequenceStepStats({
        chatbotId: input.chatbotId,
        sequenceId: input.sequenceId,
        stepId: input.stepId,
      })
    }),

  privateListSequenceStepContactsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/chatbots/{chatbotId}/sequences/{sequenceId}/steps/{stepId}/contacts",
      summary: "List sequence step contacts by event type",
      tags: ["Sequences"],
    })
    .input(listSequenceStepContactsRequest)
    .output(listSequenceStepContactsResponse)
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .handler(async ({ input }) => {
      return await listSequenceStepContacts({
        chatbotId: input.chatbotId,
        sequenceId: input.sequenceId,
        stepId: input.stepId,
        eventType: input.eventType,
        total: input.total,
        page: input.page,
        perPage: input.perPage,
      })
    }),
}
