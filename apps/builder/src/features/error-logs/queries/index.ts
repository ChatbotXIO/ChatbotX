import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { errorLogModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import { errorLogProvidersMatchingLabel } from "@chatbotx.io/utils/error-log"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListErrorLogsRequest,
  ListErrorLogsResponse,
} from "../schemas/query"

export async function listErrorLogs(
  input: ListErrorLogsRequest,
): Promise<ListErrorLogsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  // `action` stores the provider slug (`smtp`, `meta-catalog`) while the Type
  // column renders its label ("Email", "Meta catalog"), so an `ilike` on the
  // column alone cannot match what the user is looking at. Searching the labels
  // too keeps the visible value searchable.
  const providersByLabel = input.keyword
    ? errorLogProvidersMatchingLabel(input.keyword)
    : []

  const where = {
    workspaceId: input.workspaceId,
    ...(input.keyword
      ? {
          OR: [
            { action: { ilike: likeContains(input.keyword) } },
            { detail: { ilike: likeContains(input.keyword) } },
            ...(providersByLabel.length > 0
              ? [{ action: { in: providersByLabel } }]
              : []),
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
