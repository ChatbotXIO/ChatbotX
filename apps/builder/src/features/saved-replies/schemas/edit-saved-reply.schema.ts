import type { z } from "zod"
import { createSavedReplyRequest } from "./create-saved-reply.schema"

export const editSavedReplyRequest = createSavedReplyRequest

export type EditSavedReplyRequest = z.infer<typeof editSavedReplyRequest>
