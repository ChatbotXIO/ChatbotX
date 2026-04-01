import { chatbotModel, createSelectSchema } from "@chatbotx.io/database/schema"
import z from "zod"

export const chatbotResource = createSelectSchema(chatbotModel)
export type ChatbotResource = z.infer<typeof chatbotResource>

export const withChatbotIdSchema = z.object({
  chatbotId: z.bigint(),
})
