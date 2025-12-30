import { type Prisma, prisma } from "@aha.chat/database"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListRefLinksRequest } from "../schemas/get-ref-links-schema"
import type { RefLinkCollection, RefLinkResource } from "../schemas/types"

export async function getRefLinks(
  input: ListRefLinksRequest,
): Promise<RefLinkCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where: Prisma.RefLinkWhereInput = {
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
    prisma.refLink.findMany({
      skip: (input.page - 1) * input.perPage,
      take: input.perPage,
      where,
      orderBy,
      include: {
        flow: true,
      },
    }),
    prisma.refLink.count({ where }),
  ])

  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}

export async function findRefLink(
  where: Prisma.RefLinkWhereInput,
): Promise<RefLinkResource> {
  return (await prisma.refLink.findFirst({
    where,
    include: {
      field: true,
      flow: true,
    },
  })) as RefLinkResource
}
