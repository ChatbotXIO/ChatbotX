import { z } from "zod"

export const unarchiveConversationSchema = z.object({
  ids: z.array(z.string().cuid2()),
})
export type UnarchiveConversationSchema = z.infer<
  typeof unarchiveConversationSchema
>
