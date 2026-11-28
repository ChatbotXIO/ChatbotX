import { createSelectSchema, tagModel } from "@chatbotx.io/database/schema"
import z from "zod"

export const tagResource = createSelectSchema(tagModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
  // Tag rows cached before the color column existed have no `color` key.
  color: z.string().nullable().default(null),
})
export type TagResource = z.infer<typeof tagResource>

export const publicTagResource = tagResource
  .pick({
    id: true,
    name: true,
    color: true,
  })
  .extend({
    color: z
      .string()
      .nullable()
      .default(null)
      .describe("Tag color as `#RRGGBB`, or null when it has none."),
    folderId: z
      .string()
      .nullable()
      .describe("Folder the tag is in, or null when it is at the root."),
  })
export type PublicTagResource = z.infer<typeof publicTagResource>
