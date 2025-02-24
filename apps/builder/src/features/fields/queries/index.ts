import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { type Prisma, prisma } from "@ahachat.ai/database"
import { unstable_cache } from "next/cache"
import type {
  CustomFieldCollection,
  GetFieldsSchema,
} from "../schemas/get-fields-schema"

export async function listFields(
  input: GetFieldsSchema,
): Promise<CustomFieldCollection> {
  const userId = await getCurrentUserId()

  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.FieldWhereInput = {
          chatbotId: input.chatbotId,
          fieldType: input.fieldType,
        }

        if (input.folderId !== undefined) {
          where.folderId =
            input.folderId === null || input.folderId === "0"
              ? null
              : input.folderId
        }

        if (input.name) {
          where.AND = [
            {
              name: {
                contains: input.name,
                mode: "insensitive",
              },
            },
          ]
        }

        const orderBy = input.sort.map((sortItem) => ({
          [sortItem.id]: sortItem.desc ? "desc" : "asc",
        }))

        const [data, total] = await prisma.$transaction([
          prisma.field.findMany({
            skip: (input.page - 1) * input.perPage,
            take: input.perPage,
            where,
            orderBy,
          }),
          prisma.field.count({ where }),
        ])

        const pageCount = Math.ceil(total / input.perPage)

        return { data, pageCount }
      } catch (err) {
        return { data: [], pageCount: 0 }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`${userId}#fields#${input.fieldType}`],
    },
  )()
}
