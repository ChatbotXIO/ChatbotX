import type { Prisma } from "@aha.chat/database"
import { prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { ContactCollection } from "../schemas"
import type { ListContactsRequest } from "../schemas/get-contacts-schema"

export async function listContacts(
  input: ListContactsRequest,
): Promise<ContactCollection> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

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
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#contacts`],
    },
  )()
}

export async function countContacts(
  input: ListContactsRequest,
): Promise<{ total: number }> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

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
