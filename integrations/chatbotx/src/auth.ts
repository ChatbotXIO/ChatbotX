import { customAuthSchema } from "@aha.chat/sdk"
import { z } from "zod"

export const chatbotxAuthSchema = customAuthSchema.extend({
  websocketUrl: z.url(),
  apiKey: z.string().trim().min(1),
})
export type ChatbotxAuthValue = z.infer<typeof chatbotxAuthSchema>
