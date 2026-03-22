import { createSelectSchema, tagModel } from "@aha.chat/database/schema"
import type z from "zod"

export const tagResource = createSelectSchema(tagModel)
export type TagResource = z.infer<typeof tagResource>

export const publicTagResource = tagResource.pick({
  id: true,
  name: true,
})
export type PublicTagResource = z.infer<typeof publicTagResource>
