import { getCurrentUserId } from "@/auth";
import { findChatbotOrFail } from "@/lib/user-permissions";
import { prisma, Tag } from "@ahachat.ai/database";
import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { GetTagsSchema } from "../schemas/get-tags-schema";

export async function getTags(input: GetTagsSchema): Promise<{ data: Tag[], pageCount: number }> {
  const userId = await getCurrentUserId()

  return await unstable_cache(async () => {
    try {
      await findChatbotOrFail(userId, input.chatbotId)

      const where: Prisma.TagWhereInput = {}

      if (input.folderId) {
        where.folderId = input.folderId;
      }

      if (input.name) {
        where.AND = [
          {
            name: {
              contains: input.name,
              mode: 'insensitive'
            }
          },
        ]
      }

      const orderBy = input.sort.map((sortItem) => ({
        [sortItem.id]: sortItem.desc ? "desc" : "asc",
      }));

      const [data, total] = await prisma.$transaction([
        prisma.tag.findMany({
          skip: (input.page - 1) * input.perPage,
          take: input.perPage,
          where,
          orderBy,
          include: {
            contacts: true,
          }
        }),
        prisma.tag.count({ where }),
      ])

      const pageCount = Math.ceil(total / input.perPage)

      return { data, pageCount }
    } catch (err) {
      return { data: [], pageCount: 0 }
    }
  }, [JSON.stringify(input)], {
    revalidate: 3600,
    tags: [`${userId}#tags`]
  })()
}
