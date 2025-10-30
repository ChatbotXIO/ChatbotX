import { FieldType, type Prisma, prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { CustomFieldCollection } from "../schemas"
import type { ListCustomFieldsSearchParams } from "../schemas/list-custom-fields.schema"

export async function listCustomFields(
  input: ListCustomFieldsSearchParams,
): Promise<CustomFieldCollection> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      try {
        const where: Prisma.FieldWhereInput = {
          chatbotId: input.chatbotId,
          fieldType: FieldType.customField,
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

        return await prisma.$transaction(async (tx) => {
          let pageCount = 1
          const pagination: { skip?: number; take?: number } = {}

          if (input.perPage) {
            const count = await tx.field.count({ where })
            pageCount = Math.ceil(count / input.perPage)

            pagination.skip = (input.page ? input.page - 1 : 0) * input.perPage
            pagination.take = input.perPage
          }

          const data = await prisma.field.findMany({
            ...pagination,
            where,
            orderBy,
          })

          return { data, pageCount }
        })
      } catch (_err) {
        return { data: [], pageCount: 0 }
      }
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#customFields`],
    },
  )()
}
