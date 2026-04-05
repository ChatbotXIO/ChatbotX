import { createSelectSchema, tagModel } from "@chatbotx.io/database/schema"
import z from "zod"

export const tagResource = createSelectSchema(tagModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
})
export type TagResource = z.infer<typeof tagResource>

export const publicTagResource = tagResource.pick({
  id: true,
  name: true,
})
export type PublicTagResource = z.infer<typeof publicTagResource>
