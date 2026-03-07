import { db, relationsFilterToSQL } from "@aha.chat/database/client"
import { auditLogModel, errorLogModel } from "@aha.chat/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@aha.chat/database/utils"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { AuditLogResource } from "../schemas"
import type { ListAuditLogsRequest } from "../schemas/query"

export async function listAuditLogs(
  input: ListAuditLogsRequest,
): Promise<PaginatedResponse<AuditLogResource>> {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const where = {
    chatbotId: input.chatbotId,
    userId: input.userId !== null ? input.userId : undefined,
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(errorLogModel, input)

  const [data, totalRows] = await Promise.all([
    db.query.auditLogModel.findMany({
      where,
      ...pagination,
      orderBy,
      with: {
        user: true,
      },
    }),
    db.$count(auditLogModel, relationsFilterToSQL(auditLogModel, where)),
  ])

  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data, pageCount }
}
