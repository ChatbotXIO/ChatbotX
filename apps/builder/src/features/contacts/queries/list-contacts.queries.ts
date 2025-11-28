import type { Prisma } from "@aha.chat/database"
import { prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { calcCacheTags } from "@/lib/cache-helper"
import type { ContactCollection } from "../schemas"
import type { ListContactsRequest } from "../schemas/get-contacts-schema"

export async function listContacts(
  input: ListContactsRequest,
): Promise<ContactCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  return await unstable_cache(
    async () => {
      const where = generateWhere(input)

      const take = input.perPage || 10
      const skip = ((input.page ?? 1) - 1) * take
      const [data, total] = await prisma.$transaction([
        prisma.contact.findMany({
          skip,
          take,
          where,
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
    },
    [JSON.stringify(input)],
    calcCacheTags([`chatbots:${input.chatbotId}#contacts`]),
  )()
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
        phoneNumber: {
          contains: input.keyword,
        },
      },
    ]
  }

  return where
}
