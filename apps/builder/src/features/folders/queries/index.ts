import { prisma } from "@aha.chat/database"
import type { FolderModel, FolderType } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  GetCurrentFolderSchema,
  ListFoldersSearchParams,
} from "../schemas/query"
import { FolderException } from "../schemas/resource"

export const getFolders = async (
  input: ListFoldersSearchParams,
): Promise<{ data: FolderModel[] }> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const { folderId, ...rest } = input

  const data = await prisma.folder.findMany({
    where: {
      ...rest,
      folderType: rest.folderType as FolderType,
      parentId: !folderId || input.folderId === "" ? null : input.folderId,
    },
    orderBy: [
      {
        createdAt: "asc",
      },
    ],
  })

  return { data }
}

export const getCurrentFolder = async (
  input: GetCurrentFolderSchema,
): Promise<{ folder: FolderModel | null; parents: FolderModel[] }> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const folder = await prisma.folder.findFirst({
    where: input,
  })
  if (!folder) {
    return { folder: null, parents: [] }
  }

  let parents: FolderModel[] = []
  if (folder.paths.length > 0) {
    const tempParents = await prisma.folder.findMany({
      where: {
        id: { in: folder.paths },
      },
    })

    // Sort by path's order
    const orderedPaths = folder.paths.reduce(
      (result, value) => {
        result[value] = null
        return result
      },
      {} as Record<string, FolderModel | null>,
    )

    for (const temp of tempParents) {
      orderedPaths[temp.id] = temp
    }

    // Remove null value
    parents = Object.values(orderedPaths).filter((v) => v?.id) as FolderModel[]
  }

  return { folder, parents }
}

export const ensureFolderIdExists = async (
  chatbotId: string,
  folderType: FolderType,
  id: string,
): Promise<void> => {
  const existingFolder = await prisma.folder.findFirst({
    select: {
      id: true,
    },
    where: {
      chatbotId,
      folderType,
      id,
    },
  })
  if (!existingFolder) {
    throw new FolderException("Folder does not exists.")
  }
}
