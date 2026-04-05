import { createSelectSchema, folderModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"

export const folderResource = createSelectSchema(folderModel, {
  id: z.string(),
  workspaceId: z.string(),
  parentId: z.string().nullish(),
})
export type FolderResource = z.infer<typeof folderResource>

export const listFoldersRequest = z.object({
  workspaceId: zodBigintAsString(),
  folderType: z.string(),
  folderId: zodBigintAsString().nullish().default(null),
  isTrash: z.boolean().nullish().default(false),
})
export type ListFoldersRequest = z.infer<typeof listFoldersRequest>

export const listFoldersResponse = z.object({
  data: z.array(folderResource),
})
export type ListFoldersResponse = z.infer<typeof listFoldersResponse>
