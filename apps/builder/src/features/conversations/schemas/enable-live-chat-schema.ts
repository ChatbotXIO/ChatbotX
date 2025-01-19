import { z } from "zod"

export const enableLiveChatSchema = z.object({
  ids: z.array(z.string().cuid2()),
  liveChatEnabled: z.boolean(),
})
export type EnableLiveChatSchema = z.infer<typeof enableLiveChatSchema>

export const enableLiveChatBindSchema: [chatbotId: z.ZodString] = [
  z.string().cuid2(),
]
export type EnableLiveChatBindSchema = [chatbotId: string]
