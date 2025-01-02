import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { Folder, prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import { GetCurrentFoldersSchema, GetFoldersSchema } from "../schemas/get-folders-schema"

export const getFolders = async (input: GetFoldersSchema): Promise<{ data: Folder[] }> => {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(async () => {
    try {
      const data = await prisma.folder.findMany({
        where: input,
        orderBy: [{
          createdAt: "asc"
        }]
      })

      return { data }
    } catch (err) {
      return { data: [] }
    }
  }, [JSON.stringify(input)], {
    revalidate: 3600,
    tags: [
      `${userId}#folders#${input.folderType}`,
    ]
  })()
}

export const getCurrentFolder = async (input: GetCurrentFoldersSchema): Promise<{ folder: Folder | null, parents: Folder[] }> => {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(async () => {
    try {
      const folder = await prisma.folder.findFirstOrThrow({
        where: input,
      })

      let parents: Folder[] = []
      if (folder.paths.length > 0) {
        const tempParents = await prisma.folder.findMany({
          where: {
            id: { in: folder.paths }
          }
        })

        // Sort by path's order
        const orderedPaths = folder.paths.reduce((result, value) => {
          result[value] = null
          return result;
        }, {} as Record<string, Folder | null>);

        for (let temp of tempParents) {
          orderedPaths[temp.id] = temp
        }

        // Remove null value
        parents = Object.values(orderedPaths).filter(v => !!v)
      }

      return { folder, parents }
    } catch (err) {
      return { folder: null, parents: [] }
    }
  }, [JSON.stringify(input)], {
    revalidate: 3600,
    tags: [
      `${userId}#folders`,
      `${userId}#folders#${input.id}`,
    ]
  })()
}
