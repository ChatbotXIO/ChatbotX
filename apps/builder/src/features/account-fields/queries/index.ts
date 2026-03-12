import { db, relationsFilterToSQL } from "@aha.chat/database/client"
import { rootFolderId } from "@aha.chat/database/enums"
import { fieldModel } from "@aha.chat/database/schema"
import { parseOrderByAsObject, parsePagination } from "@aha.chat/database/utils"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  FindAccountFieldRequest,
  ListAccountFieldsSearchParams,
} from "../schemas/query"
import type { AccountFieldResource } from "../schemas/resource"

export async function listAccountFields(
  input: ListAccountFieldsSearchParams,
): Promise<PaginatedResponse<AccountFieldResource>> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where = {
    chatbotId: input.chatbotId,
    fieldType: "accountField" as const,
    folderId: input.folderId
      ? // biome-ignore lint/style/noNestedTernary: allow nested ternary
        input.folderId === rootFolderId
        ? { isNull: true as const }
        : input.folderId
      : undefined,
    name: input.name
      ? {
          ilike: `%${input.name.toLowerCase()}%`,
        }
      : undefined,
  }

  const orderBy = parseOrderByAsObject(fieldModel, input)

  const pagination = parsePagination(input)
  const [data, total] = await Promise.all([
    db.query.fieldModel.findMany({
      where,
      orderBy,
      ...pagination,
    }),
    db.$count(fieldModel, relationsFilterToSQL(fieldModel, where)),
  ])

  const pageCount = pagination?.limit ? Math.ceil(total / pagination.limit) : 1

  return { data, pageCount }
}

export const findAccountField = async (
  input: FindAccountFieldRequest,
): Promise<AccountFieldResource | undefined> => {
  return await db.query.fieldModel.findFirst({
    where: {
      ...input,
      fieldType: "accountField" as const,
    },
  })
}
