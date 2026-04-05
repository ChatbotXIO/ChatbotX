import { findOrFail } from "@chatbotx.io/database/client"
import type { FolderType } from "@chatbotx.io/database/partials"
import { folderModel } from "@chatbotx.io/database/schema"

export const ensureFolderIsExists = async (
  id: string,
  workspaceId: string,
  folderType: FolderType,
) => {
  await findOrFail({
    table: folderModel,
    where: {
      workspaceId,
      id,
      folderType,
    },
    message: "Folder does not exists.",
  })
}
