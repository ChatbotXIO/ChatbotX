import { customAuthSchema } from "@chatbotx.io/sdk"
import { z } from "zod"

export const chatbotxAuthSchema = customAuthSchema.extend({
  appUrl: z.url(),
  realtimeUrl: z.url(),
  apiKey: z.string().trim().min(1),
})
export type ChatbotxAuthValue = z.infer<typeof chatbotxAuthSchema>
