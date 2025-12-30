import { type Prisma, prisma } from "@aha.chat/database"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListReflinksRequest } from "../schemas/get-ref-links-schema"
import type { ReflinkCollection, ReflinkResource } from "../schemas/types"

export async function getReflinks(
  input: ListReflinksRequest,
): Promise<ReflinkCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where: Prisma.ReflinkWhereInput = {
    chatbotId: input.chatbotId,
    name: input.name
      ? {
          contains: input.name,
          mode: "insensitive",
        }
      : undefined,
  }
  const orderBy = input.sort.map((sortItem) => ({
    [sortItem.id]: sortItem.desc ? "desc" : "asc",
  }))

  const [data, total] = await prisma.$transaction([
    prisma.reflink.findMany({
      skip: (input.page - 1) * input.perPage,
      take: input.perPage,
      where,
      orderBy,
      include: {
        flow: true,
      },
    }),
    prisma.reflink.count({ where }),
  ])

  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}

export async function findReflink(
  where: Prisma.ReflinkWhereInput,
): Promise<ReflinkResource> {
  return (await prisma.reflink.findFirst({
    where,
    include: {
      field: true,
      flow: true,
    },
  })) as ReflinkResource
}
