import { prisma } from "@aha.chat/database"
import type { FolderModel, FolderType } from "@aha.chat/database/types"
import { unstable_cache } from "next/cache"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type {
  GetCurrentFolderSchema,
  ListFoldersSearchParams,
} from "../schemas/list-folders-schema"
import { FolderException } from "../schemas/types"

export const getFolders = async (
  input: ListFoldersSearchParams,
): Promise<{ data: FolderModel[] }> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  const { folderId, ...others } = input

  return await unstable_cache(
    async () => {
      const data = await prisma.folder.findMany({
        where: {
          ...others,
          parentId: !folderId || input.folderId === "" ? null : input.folderId,
        },
        orderBy: [
          {
            createdAt: "asc",
          },
        ],
      })

      return { data }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#folders#${input.folderType}`],
    },
  )()
}

export const getCurrentFolder = async (
  input: GetCurrentFolderSchema,
): Promise<{ folder: FolderModel | null; parents: FolderModel[] }> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  const folder = await prisma.folder.findFirst({
    where: input,
  })
  if (!folder) {
    return { folder: null, parents: [] }
  }

  return await unstable_cache(
    async () => {
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
        parents = Object.values(orderedPaths).filter(
          (v) => v?.id,
        ) as FolderModel[]
      }

      return { folder, parents }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [
        `chatbots:${input.chatbotId}#folders`,
        `chatbots:${input.chatbotId}#folders:${input.id}`,
      ],
    },
  )()
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
