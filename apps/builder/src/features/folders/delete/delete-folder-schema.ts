import { z } from "zod"

export const deleteFolderSchema = z.object({
  chatbotId: z.string().cuid2(),
  folderId: z.string().cuid2(),
})

export type DeleteFolderSchema = z.infer<typeof deleteFolderSchema>
