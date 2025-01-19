import { z } from "zod"

export const archiveConversationSchema = z.object({
  ids: z.array(z.string().cuid2()),
})
export type ArchiveConversationSchema = z.infer<
  typeof archiveConversationSchema
>

export const archiveConversationBindSchema: [chatbotId: z.ZodString] = [
  z.string().cuid2(),
]
export type ArchiveConversationBindSchema = [chatbotId: string]
