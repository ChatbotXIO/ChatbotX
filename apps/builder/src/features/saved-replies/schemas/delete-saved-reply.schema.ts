import { z } from "zod"

export const deleteSavedReplyRequest = z.object({
  id: z.cuid2(),
})

export type DeleteSavedReplyRequest = z.infer<typeof deleteSavedReplyRequest>
