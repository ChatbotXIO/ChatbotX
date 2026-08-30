import { createSelectSchema, tagModel } from "@chatbotx.io/database/schema"
import { z } from "zod"

const tagResource = createSelectSchema(tagModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
})

export const publicTagResource = tagResource.pick({
  id: true,
  name: true,
})
export type PublicTagResource = z.infer<typeof publicTagResource>

export const publicListTagsResponse = z.object({
  data: z.array(publicTagResource),
})
export type PublicListTagsResponse = z.infer<typeof publicListTagsResponse>
