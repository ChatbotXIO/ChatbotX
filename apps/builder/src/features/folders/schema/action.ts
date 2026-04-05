import { folderTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createFolderSchema = z.object({
  name: z.string().trim().min(1).max(255),
  parentId: zodBigintAsString().nullable(),
  folderType: folderTypes,
})
export type CreateFolderSchema = z.infer<typeof createFolderSchema>

export const editFolderSchema = z
  .object({
    name: createFolderSchema.shape.name,
  })
  .partial()
export type EditFolderSchema = z.infer<typeof editFolderSchema>

export const changeFolderRequest = z.object({
  folderType: folderTypes,
  modelIds: z.array(zodBigintAsString()),
  newFolderId: zodBigintAsString().or(z.literal("")),
})
export type ChangeFolderRequest = z.infer<typeof changeFolderRequest>
