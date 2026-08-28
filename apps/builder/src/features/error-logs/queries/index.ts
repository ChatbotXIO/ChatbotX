import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { errorLogModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListErrorLogsRequest,
  ListErrorLogsResponse,
} from "../schemas/query"

export async function listErrorLogs(
  input: ListErrorLogsRequest,
): Promise<ListErrorLogsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const where = {
    workspaceId: input.workspaceId,
    ...(input.keyword
      ? {
          OR: [
            { action: { ilike: likeContains(input.keyword) } },
            { detail: { ilike: likeContains(input.keyword) } },
          ],
        }
      : {}),
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(errorLogModel, input)

  const [data, totalRows] = await Promise.all([
    db.query.errorLogModel.findMany({
      where,
      ...pagination,
      orderBy,
      with: {
        contact: {
          with: {
            // `ErrorLog` stores no conversationId and gains no columns, so the
            // live-chat link target is resolved through the contact. Only `id`
            // is read, by the row's live-chat link.
            conversation: { columns: { id: true } },
          },
        },
      },
    }),
    db.$count(errorLogModel, relationsFilterToSQL(errorLogModel, where)),
  ])

  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data, pageCount }
}
