"use server"

import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { auditLogModel } from "@chatbotx.io/database/schema"
import { getPaginationWithDefaults } from "@chatbotx.io/database/utils"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { AuditLogResource } from "../schemas"
import type { ListAuditLogsRequest } from "../schemas/query"

export type ListAuditLogsResponse = {
  data: AuditLogResource[]
  pageCount: number
  totalRows: number
}

export async function listAuditLogs(
  input: ListAuditLogsRequest,
): Promise<ListAuditLogsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const where: {
    workspaceId: string
    userId?: string
    action?: string
  } = { workspaceId: input.workspaceId }
  if (input.userId) {
    where.userId = input.userId
  }
  if (input.action) {
    where.action = input.action
  }

  const pagination = getPaginationWithDefaults(input)

  const [data, totalRows] = await Promise.all([
    db.query.auditLogModel.findMany({
      where,
      ...pagination,
      orderBy: { createdAt: "desc" },
      with: {
        user: { columns: { id: true, name: true, email: true, image: true } },
      },
    }),
    db.$count(auditLogModel, relationsFilterToSQL(auditLogModel, where)),
  ])

  const pageCount = Math.ceil(totalRows / pagination.limit)
  return { data, pageCount, totalRows }
}

export async function listAuditLogActions(
  workspaceId: string,
): Promise<string[]> {
  await assertCurrentUserCanAccessChatbot(workspaceId)
  const rows = await db
    .selectDistinct({ action: auditLogModel.action })
    .from(auditLogModel)
    .where(relationsFilterToSQL(auditLogModel, { workspaceId } as never))
    .orderBy(auditLogModel.action)
  return rows.map((r) => r.action)
}
