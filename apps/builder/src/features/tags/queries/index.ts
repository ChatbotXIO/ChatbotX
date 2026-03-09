import { db, eq, relationsFilterToSQL } from "@aha.chat/database/client"
import { rootFolderId } from "@aha.chat/database/enums"
import { contactsToTagsModel, tagModel } from "@aha.chat/database/schema"
import { parseOrderByAsObject, parsePagination } from "@aha.chat/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  FindTagRequest,
  ListTagsRequest,
  ListTagsResponse,
} from "../schemas/query"

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

export const findTag = async (input: FindTagRequest) => {
  const { folderId, ...where } = input
  return await db.query.tagModel.findFirst({
    where: {
      ...where,
      folderId: folderId === null ? { isNull: true as const } : folderId,
    },
  })
}
