import { folderType } from "@chatbotx.io/database/schema"
import { z } from "zod"

export const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(255),
  parentId: z.bigint().nullable(),
  folderType: z.enum(folderType.enumValues),
})
export type CreateFolderSchema = z.infer<typeof createFolderSchema>

export const editFolderSchema = z
  .object({
    name: createFolderSchema.shape.name,
  })
  .partial()
export type EditFolderSchema = z.infer<typeof editFolderSchema>

export const changeFolderRequest = z.object({
  folderType: z.enum(folderType.enumValues),
  modelIds: z.array(z.bigint()),
  newFolderId: z.bigint().or(z.literal(BigInt(0))),
})
export type ChangeFolderRequest = z.infer<typeof changeFolderRequest>
