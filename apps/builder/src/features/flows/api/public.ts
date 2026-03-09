import z from "zod"
import { chatbotTokenAPI } from "@/orpc"
import { listFlows } from "../queries"
import { flowResource } from "../schemas/resource"

const publicFlowsAPI = {
  publicListFlowsAPI: chatbotTokenAPI
    .route({
      method: "GET",
      path: "/public/chatbots/flows",
      summary: "Get all flows",
      tags: ["Chatbots"],
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

export default publicFlowsAPI
