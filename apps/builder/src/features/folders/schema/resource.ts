import {
  createSelectSchema,
  folderModel,
  folderType,
} from "@aha.chat/database/schema"
import z from "zod"

export const folderResource = createSelectSchema(folderModel)
export type FolderResource = z.infer<typeof folderResource>

export const listFoldersRequest = z.object({
  chatbotId: z.bigint(),
  folderType: z.enum(folderType.enumValues).optional(),
  parentId: z.bigint().optional(),
  isTrash: z.boolean().nullish(),
})
export type ListFoldersRequest = z.infer<typeof listFoldersRequest>

export const listFoldersResponse = z.object({
  data: z.array(folderResource),
})
export type ListFoldersResponse = z.infer<typeof listFoldersResponse>
