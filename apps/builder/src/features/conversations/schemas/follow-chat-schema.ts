import { z } from "zod"

export const followChatSchema = z.object({
  ids: z.array(z.string().cuid2()),
  followed: z.boolean(),
})
export type FollowChatSchema = z.infer<typeof followChatSchema>

export const followChatBindSchema: [chatbotId: z.ZodString] = [
  z.string().cuid2(),
]
export type FollowChatBindSchema = [chatbotId: string]
