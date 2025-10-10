import { FolderType } from "@aha.chat/database/types"
import { z } from "zod"

export const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(255),
  parentId: z.cuid2().nullable(),
  folderType: z.enum(FolderType),
})
export type CreateFolderSchema = z.infer<typeof createFolderSchema>
