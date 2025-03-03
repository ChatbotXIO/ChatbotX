import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { Contact, Prisma } from "@ahachat.ai/database"
import { prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import type { ListContactsRequest } from "../schemas/get-contacts-schema"

export async function listContacts(
  input: ListContactsRequest,
): Promise<{ data: Contact[]; pageCount: number }> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where = generateWhere(input)

        const take = input.perPage || 10
        const skip = (input.page ?? 1 - 1) * take
        const [data, total] = await prisma.$transaction([
          prisma.contact.findMany({
            skip,
            take,
            where,
          }),
          prisma.contact.count({ where }),
        ])

        const pageCount = Math.ceil(total / take)

        return { data, pageCount }
      } catch (_err) {
        return { data: [], pageCount: 0 }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbot:${input.chatbotId}#contacts`],
    },
  )()
}

export async function countContacts(
  input: ListContactsRequest,
): Promise<{ total: number }> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  try {
    const where = generateWhere(input)
    const total = await prisma.contact.count({ where })

    return { total }
  } catch (_err) {
    return { total: 0 }
  }
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
