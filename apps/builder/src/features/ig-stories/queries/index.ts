import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import {
  igStoryAutomationTypes,
  rootFolderId,
} from "@chatbotx.io/database/partials"
import { igStoryAutomationModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListIgStoriesRequest,
  ListIgStoriesResponse,
} from "../schema/action"

export async function listIgStories(
  input: ListIgStoriesRequest,
): Promise<ListIgStoriesResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  // No folderId in the URL means the root view, which must scope to unfiled
  // automations only — treating it the same as "not filtered at all" would
  // surface every automation regardless of which folder it had been moved
  // into (mirrors ig-comments' listIgComments).
  const folderIdFilter: string | { isNull: true } =
    !input.folderId || input.folderId === rootFolderId
      ? { isNull: true }
      : input.folderId

  const where = {
    workspaceId: input.workspaceId,
    type: { in: [...igStoryAutomationTypes.options] },
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
  const orderBy = parseOrderByAsObject(igStoryAutomationModel, input)

  const [data, total] = await Promise.all([
    db.query.igStoryAutomationModel.findMany({
      where,
      orderBy,
      ...pagination,
    }),
    db.$count(
      igStoryAutomationModel,
      relationsFilterToSQL(igStoryAutomationModel, where),
    ),
  ])

  const pageCount = Math.ceil(total / pagination.limit)

  return { data, pageCount }
}

export async function getIgStory(workspaceId: string, id: string) {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const record = await db.query.igStoryAutomationModel.findFirst({
    where: {
      id,
      workspaceId,
      type: { in: [...igStoryAutomationTypes.options] },
    },
  })

  if (!record) {
    throw new Error("Instagram Story Automation not found")
  }

  return record
}
