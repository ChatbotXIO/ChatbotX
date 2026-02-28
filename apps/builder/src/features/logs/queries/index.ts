import { db, relationsFilterToSQL } from "@aha.chat/database/client"
import { logModel } from "@aha.chat/database/schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@/lib/pagination"
import type { LogCollection } from "../schemas"
import type { GetLogsSchema } from "../schemas/get-logs-schema"

export async function getLogs(input: GetLogsSchema): Promise<LogCollection> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where = {
    chatbotId: input.chatbotId,
    logType: input.logType,
    action: input.action ? { ilike: `%${input.action}%` } : undefined,
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(logModel, input)

  const [data, totalRows] = await Promise.all([
    db.query.logModel.findMany({
      where,
      ...pagination,
      orderBy,
      with: {
        user: true,
        contact: true,
      },
    }),
    db.$count(logModel, relationsFilterToSQL(logModel, where)),
  ])

  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data, pageCount }
}
