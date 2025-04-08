import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type Tag, prisma } from "@ahachat.ai/database"
import type { Prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import type { GetTagsSchema } from "../schemas/get-tags-schema"

export async function getTags(
  input: GetTagsSchema,
): Promise<{ data: Tag[]; pageCount: number }> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
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
      } catch (_err) {
        return { data: [], pageCount: 0 }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`${userId}#tags`],
    },
  )()
}
