import z from "zod"
import { savedReplyResource } from "./resource"

export const listSavedReplyResponse = z.array(savedReplyResource)
export type ListSavedReplyResponse = z.infer<typeof listSavedReplyResponse>
