import z from "zod"
import { chatbotTokenAPI } from "@/orpc"
import { listFlows } from "../queries"
import { flowResource } from "../schemas/resource"

const flowChatbotTokenAPIs = {
  listFlowsChatbotTokenAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/v1/flows",
      summary: "Get all flows",
      tags: ["Flows"],
    })
    .input(z.object({}))
    .output(
      z.object({
        data: z.array(flowResource.pick({ id: true, name: true })),
      }),
    )
    .handler(async ({ context, input }) => {
      return await listFlows({
        ...input,
        chatbotId: context.chatbot.id,
        active: true,
      })
    }),
}

export default flowChatbotTokenAPIs
