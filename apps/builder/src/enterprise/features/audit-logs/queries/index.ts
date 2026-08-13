import { assertEnterpriseFeatures } from "@chatbotx.io/business"
import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { auditLogModel, errorLogModel } from "@chatbotx.io/database/schema"
import {
  getPaginationWithDefaults,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { AuditLogResource } from "../schemas"
import type { ListAuditLogsRequest } from "../schemas/query"

export async function listAuditLogs(
  input: ListAuditLogsRequest,
): Promise<PaginatedResponse<AuditLogResource>> {
  // Defense in depth behind the (enterprise) route-group layout: the layout
  // only blocks page rendering, not direct invocations of this query.
  await assertEnterpriseFeatures()
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const where = {
    workspaceId: input.workspaceId,
    // userId: input.userId !== null ? input.userId : undefined,
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
