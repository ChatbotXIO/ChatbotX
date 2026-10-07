import { createSelectSchema, tagModel } from "@chatbotx.io/database/schema"
import z from "zod"

export const tagResource = createSelectSchema(tagModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
})
export type TagResource = z.infer<typeof tagResource>

export const publicTagResource = tagResource
  .pick({
    id: true,
    name: true,
  })
  .extend({
    folderId: z
      .string()
      .nullable()
      .describe("Folder the tag is in, or null when it is at the root."),
  })
export type PublicTagResource = z.infer<typeof publicTagResource>
