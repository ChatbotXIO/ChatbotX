import { findOrFail } from "@aha.chat/database/client"
import { folderModel } from "@aha.chat/database/schema"
import type { FolderModel, FolderType } from "@aha.chat/database/types"

export const ensureFolderIsExists = async (
  id: string,
  chatbotId: string,
  folderType: FolderType,
) => {
  await findOrFail<FolderModel>(
    folderModel,
    {
      chatbotId,
      id,
      folderType,
    },
    "Folder does not exists.",
  )
}
