import { type FolderType, prisma } from "@aha.chat/database"
import { FolderException } from "../schemas/resource"

export const ensureFolderIdIsExists = async (
  id: string,
  chatbotId: string,
  folderType: FolderType,
) => {
  const existingFolder = await prisma.folder.findFirst({
    select: {
      id: true,
    },
    where: {
      chatbotId,
      id,
      folderType,
    },
  })

  if (!existingFolder) {
    throw new FolderException("Folder does not exists.")
  }
}
