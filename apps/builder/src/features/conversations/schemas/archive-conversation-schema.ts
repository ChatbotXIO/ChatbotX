import { z } from "zod"

export const archiveConversationSchema = z.object({
  ids: z.array(z.string().cuid2()),
})
export type ArchiveConversationSchema = z.infer<
  typeof archiveConversationSchema
>
