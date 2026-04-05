import { db, eq, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { rootFolderId } from "@chatbotx.io/database/partials"
import { contactsToTagsModel, tagModel } from "@chatbotx.io/database/schema"
import {
  parseOrderByAsObject,
  parsePagination,
} from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  FindTagRequest,
  ListTagsRequest,
  ListTagsResponse,
} from "../schema/query"

export const listTagsRSC = async (
  input: ListTagsRequest & { workspaceId: string },
) => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await listTags(input)
}

export async function listTags(
  input: ListTagsRequest & { workspaceId: string },
): Promise<ListTagsResponse> {
  const where = {
    workspaceId: input.workspaceId,
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
