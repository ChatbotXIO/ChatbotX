import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { auditLogModel } from "@chatbotx.io/database/schema"
import type { AuditLogModel, UserModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"

type ListAuditLogsInput = {
  workspaceId: string
  page: number
  perPage: number
  sort?: { id: string; desc: boolean }[] | null
  keyword?: string
  userId?: string
  dateRange: { start: Date; end: Date }
}

type ListAuditLogsResult = {
  data: (AuditLogModel & { user: UserModel | null })[]
  pageCount: number
}

export async function listAuditLogs(
  input: ListAuditLogsInput,
): Promise<ListAuditLogsResult> {
  const { start, end } = input.dateRange

  const where = {
    workspaceId: input.workspaceId,
    createdAt: { gte: start, lte: end },
    userId: input.userId || undefined,
    ...(input.keyword
      ? {
          OR: [
            { action: { ilike: likeContains(input.keyword) } },
            { detail: { ilike: likeContains(input.keyword) } },
            { ipAddress: { ilike: likeContains(input.keyword) } },
          ],
        }
      : {}),
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = {
    ...parseOrderByAsObject(auditLogModel, input),
    id: "desc" as const,
  }

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
