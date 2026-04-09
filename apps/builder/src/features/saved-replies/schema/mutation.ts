import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { savedReplyResource } from "./resource"

export const listSavedRepliesRequest = z.object({
  workspaceId: zodBigintAsString(),
})
export type ListSavedRepliesRequest = z.infer<typeof listSavedRepliesRequest>

export const createSavedReplyRequest = z.object({
  shortcut: z.string().trim().min(1).max(100),
  text: z.string().trim().min(1).max(2000),
})
export type CreateSavedReplyRequest = z.infer<typeof createSavedReplyRequest>

export const editSavedReplyRequest = createSavedReplyRequest
export type EditSavedReplyRequest = z.infer<typeof editSavedReplyRequest>

export const deleteSavedReplyRequest = z.object({
  id: zodBigintAsString(),
})
export type DeleteSavedReplyRequest = z.infer<typeof deleteSavedReplyRequest>

export const listSavedReplyResponse = z.object({
  data: z.array(savedReplyResource),
})
export type ListSavedReplyResponse = z.infer<typeof listSavedReplyResponse>
