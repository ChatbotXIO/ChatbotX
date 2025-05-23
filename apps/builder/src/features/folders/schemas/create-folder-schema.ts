import { FolderType } from "@ahachat.ai/database/types"
import { z } from "zod"

export const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(255),
  parentId: z.string().cuid2().nullable(),
  folderType: z.nativeEnum(FolderType),
})
export type CreateFolderSchema = z.infer<typeof createFolderSchema>
