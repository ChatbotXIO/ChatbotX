import { unstable_cache } from "next/cache";
import { prisma } from "@ahachat.ai/database";
import { Folder, FolderGroup, Prisma } from "@prisma/client";

type GetFoldersSchema = {
  chatbotId: string,
  group: FolderGroup
}

export async function getFolders(input: GetFoldersSchema): Promise<{ data: Folder[] }> {
  return await unstable_cache(async () => {
    try {
      const where: Prisma.FolderWhereInput = {
        chatbotId: input.chatbotId,
        group: input.group
      }

      const data = await prisma.folder.findMany({ where })

      return { data }
    } catch (err) {
      return { data: [] }
    }
  }, [JSON.stringify(input)], {
    revalidate: 3600,
    tags: [`Folders.${input.chatbotId}.${input.group}`]
  })()
}
