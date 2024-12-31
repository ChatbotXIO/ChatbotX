import { FolderType } from "@ahachat.ai/database"
import {
  createSearchParamsCache,
  parseAsString
} from "nuqs/server"

export const getFoldersSearchParamsCache = createSearchParamsCache({
  folderId: parseAsString
})

export type GetFoldersSchema = {
  chatbotId: string,
  folderType: FolderType,
  parentId?: string | null,
}

export type GetCurrentFoldersSchema = {
  id: string,
  chatbotId: string,
}

