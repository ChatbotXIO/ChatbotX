import { db, relationsFilterToSQL } from "@aha.chat/database/client"
import { rootFolderId } from "@aha.chat/database/enums"
import { customFieldModel } from "@aha.chat/database/schema"
import { parseOrderByAsObject, parsePagination } from "@aha.chat/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  FindCustomFieldRequest,
  ListCustomFieldsRequest,
  ListCustomFieldsResponse,
} from "../schemas/query"
import type { CustomFieldResource } from "../schemas/resource"

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
  const orderBy = parseOrderByAsObject(customFieldModel, input)

  const [data, total] = await Promise.all([
    db.query.customFieldModel.findMany({
      where,
      orderBy,
      ...pagination,
    }),
    db.$count(customFieldModel, relationsFilterToSQL(customFieldModel, where)),
  ])

  const pageCount = pagination?.limit ? Math.ceil(total / pagination.limit) : 1

  return { data, pageCount, ...pagination }
}

export const findCustomField = async (
  input: FindCustomFieldRequest,
): Promise<CustomFieldResource | undefined> => {
  return await db.query.customFieldModel.findFirst({
    where: {
      ...input,
    },
  })
}
