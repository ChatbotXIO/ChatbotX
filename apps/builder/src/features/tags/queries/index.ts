import { db, eq, relationsFilterToSQL } from "@aha.chat/database/client"
import { rootFolderId } from "@aha.chat/database/enums"
import { contactsToTagsModel, tagModel } from "@aha.chat/database/schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { parseOrderByAsObject, parsePagination } from "@/lib/pagination"
import type { ListTagsRequest, ListTagsResponse } from "../schemas/query"

export const listTagsRSC = async (
  input: ListTagsRequest & { chatbotId: string },
) => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  return await listTags(input)
}

export async function listTags(
  input: ListTagsRequest & { chatbotId: string },
): Promise<ListTagsResponse> {
  const where = {
    chatbotId: input.chatbotId,
    name: input.name ? { ilike: `%${input.name.toLowerCase()}%` } : undefined,
    folderId: input.folderId
      ? // biome-ignore lint/style/noNestedTernary: allow nested ternary
        input.folderId === rootFolderId
        ? { isNull: true as const }
        : input.folderId
      : undefined,
  }

  const pagination = parsePagination(input)
  const orderBy = parseOrderByAsObject(tagModel, input)

  const [data, totalRows] = await Promise.all([
    db.query.tagModel.findMany({
      where,
      orderBy,
      ...pagination,
      extras: {
        contactsCount: (table) =>
          db.$count(
            contactsToTagsModel,
            eq(contactsToTagsModel.tagId, table.id),
          ),
      },
    }),
    pagination?.limit
      ? db.$count(tagModel, relationsFilterToSQL(tagModel, where))
      : Promise.resolve(1),
  ])

  const pageCount = pagination?.limit
    ? Math.ceil(totalRows / pagination.limit)
    : 1

  return { data, pageCount }
}
