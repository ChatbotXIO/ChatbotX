import { db, eq, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { rootFolderId } from "@chatbotx.io/database/partials"
import { contactsToTagsModel, tagModel } from "@chatbotx.io/database/schema"
import {
  likeContains,
  parseOrderByAsObject,
  parsePagination,
} from "@chatbotx.io/database/utils"
import { isNumericId } from "@chatbotx.io/utils"
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
    deletedAt: { isNull: true as const },
    name: input.name ? { ilike: likeContains(input.name) } : undefined,
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
  const { folderId, workspaceId } = input
  const folderWhere = folderId === null ? { isNull: true as const } : folderId

  if (isNumericId(input.key)) {
    const byId = await db.query.tagModel.findFirst({
      where: {
        id: input.key,
        folderId: folderWhere,
        workspaceId,
        deletedAt: { isNull: true as const },
      },
    })
    if (byId) {
      return byId
    }
  }

  return await db.query.tagModel.findFirst({
    where: {
      name: input.key,
      folderId: folderWhere,
      workspaceId,
      deletedAt: { isNull: true as const },
    },
  })
}
