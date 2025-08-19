import { FieldType, type Prisma, prisma } from "@aha.chat/database"
import { unstable_cache } from "next/cache"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import type { ListAccountFieldsSearchParams } from "../schemas/list-account-fields.schema"
import type { AccountFieldCollection } from "../schemas/types"

export async function listAccountFields(
  input: ListAccountFieldsSearchParams,
): Promise<AccountFieldCollection> {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  return await unstable_cache(
    async () => {
      const where: Prisma.FieldWhereInput = {
        chatbotId: input.chatbotId,
        fieldType: FieldType.ACCOUNT_FIELD,
      }

      if (input.folderId !== undefined) {
        where.folderId =
          input.folderId === null || input.folderId.length === 0
            ? null
            : input.folderId
      }

      if (input.name) {
        where.name = {
          contains: input.name,
          mode: "insensitive",
        }
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
    },
    [JSON.stringify(input)],
    {
      revalidate: 3600,
      tags: [`chatbots:${input.chatbotId}#accountFields`],
    },
  )()
}
