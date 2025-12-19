import type { Prisma } from "@aha.chat/database"
import { prisma } from "@aha.chat/database"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListContactsRequest } from "../schemas/query"
import type { ContactCollection } from "../schemas/resource"

export async function listContacts(
  input: ListContactsRequest,
): Promise<ContactCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where = generateWhere(input)
  const orderBy = input.sort.map((sortItem) => {
    if ((sortItem.id as string) === "keyword") {
      return {
        firstName: sortItem.desc ? "desc" : "asc",
      } as Prisma.ContactOrderByWithRelationInput
    }
    return {
      [sortItem.id]: sortItem.desc ? "desc" : "asc",
    } as Prisma.ContactOrderByWithRelationInput
  })

  const take = input.perPage || 10
  const skip = ((input.page ?? 1) - 1) * take
  const [data, total] = await prisma.$transaction([
    prisma.contact.findMany({
      skip,
      take,
      where,
      orderBy,
      include: {
        conversation: {
          include: {
            assignedUser: true,
            assignedInboxTeam: true,
          },
        },
      },
    }),
    prisma.contact.count({ where }),
  ])

  const pageCount = Math.ceil(total / take)

  return { data, pageCount }
}

export async function countContacts(
  input: ListContactsRequest,
): Promise<{ total: number }> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where = generateWhere(input)

  const total = await prisma.contact.count({ where })

  return { total }
}

const generateWhere = (
  input: ListContactsRequest,
): Prisma.ContactWhereInput => {
  const where: Prisma.ContactWhereInput = {
    chatbotId: input.chatbotId,
  }

  if (input.keyword) {
    where.OR = [
      {
        firstName: {
          contains: input.keyword,
          mode: "insensitive",
        },
      },
      {
        lastName: {
          contains: input.keyword,
          mode: "insensitive",
        },
      },
      {
        email: {
          contains: input.keyword,
        },
      },
      {
        phoneNumber: {
          contains: input.keyword,
        },
      },
    ]
  }

  return where
}
