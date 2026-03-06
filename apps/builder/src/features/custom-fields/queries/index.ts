import { db, relationsFilterToSQL } from "@aha.chat/database/client"
import { rootFolderId } from "@aha.chat/database/enums"
import { fieldModel } from "@aha.chat/database/schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { parseOrderByAsObject, parsePagination } from "@/lib/pagination"
import type {
  ListCustomFieldsRequest,
  ListCustomFieldsResponse,
} from "../schemas/query"

export const listCustomFieldsRSC = async (
  input: ListCustomFieldsRequest & { chatbotId: string },
) => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  return listCustomFields(input)
}

export async function listCustomFields(
  input: ListCustomFieldsRequest & { chatbotId: string },
): Promise<ListCustomFieldsResponse> {
  const where = {
    chatbotId: input.chatbotId,
    fieldType: "customField" as const,
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

  const pagination = parsePagination(input)
  const orderBy = parseOrderByAsObject(fieldModel, input)

  const [data, total] = await Promise.all([
    db.query.fieldModel.findMany({
      where,
      orderBy,
      ...pagination,
    }),
    db.$count(fieldModel, relationsFilterToSQL(fieldModel, where)),
  ])

  const pageCount = pagination?.limit ? Math.ceil(total / pagination.limit) : 1

  return { data, pageCount, ...pagination }
}
