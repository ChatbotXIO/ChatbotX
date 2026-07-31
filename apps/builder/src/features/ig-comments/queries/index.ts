import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import {
  igCommentAutomationTypes,
  rootFolderId,
} from "@chatbotx.io/database/partials"
import { fbCommentAutomationModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListIgCommentsRequest,
  ListIgCommentsResponse,
} from "../schema/action"

export async function listIgComments(
  input: ListIgCommentsRequest,
): Promise<ListIgCommentsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  // No folderId in the URL means the root view, which must scope to unfiled
  // automations only — treating it the same as "not filtered at all" (the
  // previous behaviour) surfaced every automation regardless of which folder
  // it had been moved into.
  const folderIdFilter: string | { isNull: true } =
    !input.folderId || input.folderId === rootFolderId
      ? { isNull: true }
      : input.folderId

  const where = {
    workspaceId: input.workspaceId,
    type: { in: [...igCommentAutomationTypes.options] },
    folderId: folderIdFilter,
    name: input.name
      ? {
          ilike: likeContains(input.name),
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

export async function getIgComment(workspaceId: string, id: string) {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const record = await db.query.fbCommentAutomationModel.findFirst({
    where: {
      id,
      workspaceId,
      type: { in: [...igCommentAutomationTypes.options] },
    },
  })

  if (!record) {
    throw new Error("Instagram Comment Automation not found")
  }

  return record
}
