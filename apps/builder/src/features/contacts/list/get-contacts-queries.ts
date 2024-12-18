import { unstable_cache } from "next/cache";
import { GetContactsSchema } from "./get-contacts-schema";
import { prisma } from "@ahachat.ai/database";
import { Contact, Prisma } from "@prisma/client";

export async function getContacts(input: GetContactsSchema): Promise<{ data: Contact[], pageCount: number }> {
  return await unstable_cache(async () => {
    try {
      const where: Prisma.ContactWhereInput = {}

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
      return { data: [], pageCount: 0 }
    }
  }, [JSON.stringify(input)], {
    revalidate: 3600,
    tags: ['contacts']
  })()
}
