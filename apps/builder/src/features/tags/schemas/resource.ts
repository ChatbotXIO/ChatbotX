import { createSelectSchema, tagModel } from "@aha.chat/database/schema"
import type z from "zod"

export const tagResource = createSelectSchema(tagModel)
export type TagResource = z.infer<typeof tagResource>
