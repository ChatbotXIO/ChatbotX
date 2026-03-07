import { db, relationsFilterToSQL } from "@aha.chat/database/client"
import { errorLogModel } from "@aha.chat/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@aha.chat/database/utils"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ErrorLogResource } from "../schemas"
import type { ListErrorLogsRequest } from "../schemas/query"

export async function listErrorLogs(
  input: ListErrorLogsRequest,
): Promise<PaginatedResponse<ErrorLogResource>> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where = {
    chatbotId: input.chatbotId,
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
