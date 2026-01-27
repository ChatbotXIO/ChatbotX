import type { Prisma } from "@aha.chat/database"
import { prisma } from "@aha.chat/database"
import { rootFolderId } from "@aha.chat/database/enums"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { GetTagsSchema } from "../schemas/get-tags-schema"
import type { TagCollection } from "../schemas/resource"

export async function getTags(input: GetTagsSchema): Promise<TagCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where: Prisma.TagWhereInput = {
    chatbotId: input.chatbotId,
  }

  if (input.folderId) {
    where.folderId = input.folderId === rootFolderId ? null : input.folderId
  }

  if (input.name) {
    where.name = {
      contains: input.name,
      mode: "insensitive",
    }
  }

  const orderBy = input.sort.map((sortItem) => {
    if ((sortItem.id as string) === "contacts") {
      return {
        contacts: {
          _count: sortItem.desc ? "desc" : "asc",
        },
      } as Prisma.TagOrderByWithRelationInput
    }
    return {
      [sortItem.id]: sortItem.desc ? "desc" : "asc",
    } as Prisma.TagOrderByWithRelationInput
  })

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
}
