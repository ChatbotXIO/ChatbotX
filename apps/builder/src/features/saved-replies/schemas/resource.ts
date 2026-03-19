import { createSelectSchema, savedReplyModel } from "@aha.chat/database/schema"
import type z from "zod"

export const savedReplyResource = createSelectSchema(savedReplyModel)
export type SavedReplyResource = z.infer<typeof savedReplyResource>
