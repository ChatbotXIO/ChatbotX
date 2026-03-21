import { findOrFail } from "@chatbotx.io/database/client"
import { folderModel } from "@chatbotx.io/database/schema"
import type { FolderModel, FolderType } from "@chatbotx.io/database/types"

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
