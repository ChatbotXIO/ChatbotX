import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type Folder, type FolderType, prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import { FolderException } from "../schemas/types"
import type {
  GetCurrentFolderSchema,
  ListFoldersSearchParams,
} from "../schemas/list-folders-schema"

export const getFolders = async (
  input: ListFoldersSearchParams,
): Promise<{ data: Folder[] }> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const data = await prisma.folder.findMany({
          where: {
            ...input,
            parentId: input.parentId === "" ? null : input.parentId,
          },
          orderBy: [
            {
              createdAt: "asc",
            },
          ],
        })

        return { data }
      } catch (_err) {
        return { data: [] }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#folders`],
    },
  )()
}

export const getCurrentFolder = async (
  input: GetCurrentFolderSchema,
): Promise<{ folder: Folder | null; parents: Folder[] }> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const folder = await prisma.folder.findFirstOrThrow({
          where: input,
        })

        let parents: Folder[] = []
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
            {} as Record<string, Folder | null>,
          )

          for (const temp of tempParents) {
            orderedPaths[temp.id] = temp
          }

          // Remove null value
          parents = Object.values(orderedPaths).filter((v) => !!v)
        }

        return { folder, parents }
      } catch (_err) {
        return { folder: null, parents: [] }
      }
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
