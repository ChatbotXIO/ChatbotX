import { unstable_cache } from "next/cache";
import { GetContactsSchema } from "./get-contacts-schema";
import { prisma } from "@ahachat.ai/database";
import { Contact, Prisma } from "@prisma/client";
import { getCurrentUserId } from "@/auth";
import { findChatbotOrFail } from "@/lib/user-permissions";

export async function getContacts(input: GetContactsSchema): Promise<{ data: Contact[], pageCount: number }> {
  const userId = await getCurrentUserId()

  return await unstable_cache(async () => {
    try {
      await findChatbotOrFail(userId, input.chatbotId)

      const where: Prisma.ContactWhereInput = {
        chatbotId: input.chatbotId
      }

      if (input.keyword) {
        where.OR = [
          {
            firstName: {
              contains: input.keyword,
              mode: 'insensitive'
            }
          },
          {
            lastName: {
              contains: input.keyword,
              mode: 'insensitive'
            }
          }
        ]
      }

      const [data, total] = await prisma.$transaction([
        prisma.contact.findMany({
          skip: (input.page - 1) * input.perPage,
          take: input.perPage,
          where,
        }),
        prisma.contact.count({ where }),
      ])

      const pageCount = Math.ceil(total / input.perPage)

      return { data, pageCount }
    } catch (err) {
      console.log("errrrrrrrrrr", err)
      return { data: [], pageCount: 0 }
    }
  }, [JSON.stringify(input)], {
    revalidate: 3600,
    tags: ['contacts']
  })()
}
