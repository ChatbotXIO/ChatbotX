import { z } from "zod"

export const createSavedReplyRequest = z.object({
  shortcut: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(2000),
})

export type CreateSavedReplyRequest = z.infer<typeof createSavedReplyRequest>
