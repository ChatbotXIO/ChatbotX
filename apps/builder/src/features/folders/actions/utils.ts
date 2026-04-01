import { findOrFail } from "@chatbotx.io/database/client"
import { folderModel } from "@chatbotx.io/database/schema"
import type { FolderType } from "@chatbotx.io/database/types"

export const ensureFolderIsExists = async (
  id: bigint,
  chatbotId: bigint,
  folderType: FolderType,
) => {
  await findOrFail(
    folderModel,
    {
      chatbotId,
      id,
      folderType,
    },
    "Folder does not exists.",
  )
}
