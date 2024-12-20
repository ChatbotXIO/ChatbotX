import { z } from "zod"

export const editFolderSchema = z.object({
  chatbotId: z.string().cuid2(),
  folderId: z.string().cuid2(),
  name: z.string().min(1).max(255).trim(),
})

export type EditFolderSchema = z.infer<typeof editFolderSchema>
