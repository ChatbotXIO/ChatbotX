import { z } from "zod"

export const createSavedReplyRequest = z.object({
  shortcut: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(2000),
})
export type CreateSavedReplyRequest = z.infer<typeof createSavedReplyRequest>

export const editSavedReplyRequest = createSavedReplyRequest
export type EditSavedReplyRequest = z.infer<typeof editSavedReplyRequest>

export const deleteSavedReplyRequest = z.object({
  id: z.cuid2(),
})
export type DeleteSavedReplyRequest = z.infer<typeof deleteSavedReplyRequest>
