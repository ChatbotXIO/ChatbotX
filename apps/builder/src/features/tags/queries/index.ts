import type { Prisma } from "@aha.chat/database"
import { prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { calcCacheTags } from "@/lib/cache-helper"
import type { TagCollection } from "../schemas"
import type { GetTagsSchema } from "../schemas/get-tags-schema"

export async function getTags(input: GetTagsSchema): Promise<TagCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  return await unstable_cache(
    async () => {
      const where: Prisma.TagWhereInput = {
        chatbotId: input.chatbotId,
      }

      if (input.folderId !== undefined) {
        where.folderId =
          input.folderId === null || input.folderId === "0"
            ? null
            : input.folderId
      }

      if (input.name) {
        where.AND = [
          {
            name: {
              contains: input.name,
              mode: "insensitive",
            },
          },
        ]
      }

      const orderBy = input.sort.map((sortItem) => ({
        [sortItem.id]: sortItem.desc ? "desc" : "asc",
      }))

      const [data, total] = await prisma.$transaction([
        prisma.tag.findMany({
          skip: (input.page - 1) * input.perPage,
          take: input.perPage,
          where,
          orderBy,
          include: {
            _count: {
              select: {
                contacts: true,
              },
            },
          },
        }),
        prisma.tag.count({ where }),
      ])

      const pageCount = Math.ceil(total / input.perPage)

      return { data, pageCount }
    },
    [JSON.stringify(input)],
    calcCacheTags([`chatbots:${input.chatbotId}#tags`]),
  )()
}
