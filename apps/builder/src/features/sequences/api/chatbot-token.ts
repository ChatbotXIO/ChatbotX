import z from "zod"
import { basePaginationRequest } from "@/lib/pagination"
import { chatbotTokenAPI } from "@/orpc"
import { getSequence, listSequences } from "../queries"
import { listSequencesResponse, sequenceResource } from "../schema"

export const chatbotTokenSequencesAPIs = {
  listSequencesChatbotTokenAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/sequences",
      summary: "List sequences",
      tags: ["Sequences"],
    })
    .input(basePaginationRequest)
    .output(listSequencesResponse)
    .handler(async ({ context, input }) => {
      return await listSequences({ ...input, chatbotId: context.chatbot.id })
    }),

  getSequenceChatbotTokenAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/sequences/{id}",
      summary: "Get sequence details",
      tags: ["Sequences"],
    })
    .input(z.object({ id: z.string() }))
    .output(sequenceResource)
    .handler(async ({ context, input }) => {
      return await getSequence(context.chatbot.id, input.id)
    }),
}

export default chatbotTokenSequencesAPIs
