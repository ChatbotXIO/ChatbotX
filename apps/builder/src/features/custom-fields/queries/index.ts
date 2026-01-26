import { FieldType, type Prisma, prisma } from "@aha.chat/database"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { CustomFieldCollection } from "../schemas"
import type { ListCustomFieldsSearchParams } from "../schemas/list-custom-fields.schema"

export async function listCustomFields(
  input: ListCustomFieldsSearchParams,
): Promise<CustomFieldCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where: Prisma.FieldWhereInput = {
    chatbotId: input.chatbotId,
    fieldType: FieldType.customField,
  }

  if (input.folderId) {
    where.folderId = input.folderId === "0" ? null : input.folderId
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
}
