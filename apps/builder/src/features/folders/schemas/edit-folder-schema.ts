import { z } from "zod"

export const editFolderSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  // parentId: z.cuid2().nullish(),
})
export type EditFolderSchema = z.infer<typeof editFolderSchema>
