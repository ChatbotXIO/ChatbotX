import {
  type DatabaseClient,
  db,
  relationsFilterToSQL,
} from "@chatbotx.io/database/client"
import { auditLogModel } from "@chatbotx.io/database/schema"
import type { AuditLogModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import type { AuditLogAction } from "./types"

type LogParams = {
  tx?: DatabaseClient
  workspaceId: string
  userId?: string | null
  action: AuditLogAction | string
  detail: string
}

type ListParams = {
  tx?: DatabaseClient
  workspaceId: string
  userId?: string
  action?: string
  dateFrom?: Date
  dateTo?: Date
  limit?: number
  offset?: number
}

export class AuditLogService extends BaseService {
  async log(props: LogParams): Promise<AuditLogModel> {
    const { tx = db, workspaceId, userId, action, detail } = props
    const [row] = await tx
      .insert(auditLogModel)
      .values({
        workspaceId,
        userId: userId ?? null,
        action,
        detail,
      })
      .returning()
    return row
  }

  async listByWorkspaceId(
    props: ListParams,
  ): Promise<{ data: AuditLogModel[]; total: number }> {
    const {
      tx = db,
      workspaceId,
      userId,
      action,
      dateFrom,
      dateTo,
      limit = 50,
      offset = 0,
    } = props

    const where: Record<string, unknown> = { workspaceId }
    if (userId) {
      where.userId = userId
    }
    if (action) {
      where.action = action
    }
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {}
      if (dateFrom) {
        range.gte = dateFrom
      }
      if (dateTo) {
        range.lte = dateTo
      }
      where.createdAt = range
    }

    const [data, total] = await Promise.all([
      tx.query.auditLogModel.findMany({
        where,
        limit,
        offset,
        orderBy: { createdAt: "desc" },
      }),
      tx.$count(
        auditLogModel,
        relationsFilterToSQL(auditLogModel, where as never),
      ),
    ])

    return { data, total: Number(total) }
  }
}

export const auditLogService = new AuditLogService()

export async function logAudit(props: LogParams): Promise<void> {
  try {
    await auditLogService.log(props)
  } catch (err) {
    console.error("[audit-log] failed to write", {
      action: props.action,
      workspaceId: props.workspaceId,
      err,
    })
  }
}
