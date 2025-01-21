import { z } from "zod"

export const enableLiveChatSchema = z.object({
  ids: z.array(z.string().cuid2()),
  liveChatEnabled: z.boolean(),
})
export type EnableLiveChatSchema = z.infer<typeof enableLiveChatSchema>
