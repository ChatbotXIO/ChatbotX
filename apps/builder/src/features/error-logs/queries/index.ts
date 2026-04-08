import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { errorLogModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
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
            { action: { ilike: `%${input.keyword}%` } },
            { detail: { ilike: `%${input.keyword}%` } },
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
        contact: true,
      },
    }),
    db.$count(errorLogModel, relationsFilterToSQL(errorLogModel, where)),
  ])

  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data, pageCount }
}
