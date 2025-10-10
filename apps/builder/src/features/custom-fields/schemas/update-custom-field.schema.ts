import { z } from "zod"

export const updateCustomFieldSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().optional(),
  folderId: z.cuid2().nullish(),
})
export type UpdateCustomFieldSchema = z.infer<typeof updateCustomFieldSchema>
