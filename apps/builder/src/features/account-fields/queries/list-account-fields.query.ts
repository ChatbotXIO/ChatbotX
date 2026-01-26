import { FieldType, type Prisma, prisma } from "@aha.chat/database"
import { rootFolderId } from "@aha.chat/database/enums"
import type { FieldFindManyArgs } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListAccountFieldsSearchParams } from "../schemas/list-account-fields.schema"
import type { AccountFieldCollection } from "../schemas/types"

export async function listAccountFields(
  input: ListAccountFieldsSearchParams,
): Promise<AccountFieldCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where: Prisma.FieldWhereInput = {
    chatbotId: input.chatbotId,
    fieldType: FieldType.accountField,
  }

  if (input.folderId) {
    where.folderId = input.folderId === rootFolderId ? null : input.folderId
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
  const params: FieldFindManyArgs = {
    where,
    skip: (input.page - 1) * input.perPage,
    take: input.perPage,
    orderBy,
  }

  const [data, total] = await prisma.$transaction([
    prisma.field.findMany(params),
    prisma.field.count({ where: params.where }),
  ])

  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}
