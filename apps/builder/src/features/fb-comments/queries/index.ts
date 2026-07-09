import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { rootFolderId } from "@chatbotx.io/database/partials"
import { fbCommentAutomationModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListFbCommentsRequest,
  ListFbCommentsResponse,
} from "../schema/action"

export async function listFbComments(
  input: ListFbCommentsRequest,
): Promise<ListFbCommentsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  let folderIdFilter: string | { isNull: true } | undefined
  if (input.folderId) {
    folderIdFilter =
      input.folderId === rootFolderId
        ? { isNull: true as const }
        : input.folderId
  }

  const where = {
    workspaceId: input.workspaceId,
    folderId: folderIdFilter,
    name: input.name
      ? {
          ilike: `%${input.name}%`,
        }
      : undefined,
    isActive:
      input.isActive !== undefined && input.isActive !== null
        ? input.isActive
        : undefined,
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(fbCommentAutomationModel, input)

  const [data, total] = await Promise.all([
    db.query.fbCommentAutomationModel.findMany({
      where,
      orderBy,
      ...pagination,
    }),
    db.$count(
      fbCommentAutomationModel,
      relationsFilterToSQL(fbCommentAutomationModel, where),
    ),
  ])

  const pageCount = Math.ceil(total / pagination.limit)

  return { data, pageCount }
}

export async function getFbComment(workspaceId: string, id: string) {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const record = await db.query.fbCommentAutomationModel.findFirst({
    where: { id, workspaceId },
  })

  if (!record) {
    throw new Error("FB Comment Automation not found")
  }

  return record
}
