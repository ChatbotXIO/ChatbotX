import { createId } from "@chatbotx.io/utils"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../logger"
import { getAuditActor } from "./context"

export type AuditRecordInput = {
  action: string
  detail: string
  userId?: string
  workspaceId?: string
  ipAddress?: string
  userAgent?: string
  source?: string
}

class AuditService {
  async record(input: AuditRecordInput) {
    const actor = getAuditActor()
    const userId = input.userId ?? actor?.userId
    const workspaceId = input.workspaceId ?? actor?.workspaceId

    if (!(userId && workspaceId)) {
      // debug, not warn: this is also the by-design no-op path for Public
      // API (workspace-token) calls, which never carry an admin actor —
      // warn-level here would spam logs on every legitimate token request.
      logger.debug(
        { action: input.action, source: input.source },
        "audit record dropped: missing userId or workspaceId",
      )
      return
    }

    const auditLogId = createId()

    try {
      await defaultQueue.add(
        DefaultJobAction.sendAuditLog,
        {
          type: DefaultJobAction.sendAuditLog,
          data: {
            auditLogId,
            userId,
            workspaceId,
            action: input.action,
            detail: input.detail,
            ipAddress: input.ipAddress ?? actor?.ipAddress,
            userAgent: input.userAgent ?? actor?.userAgent,
            source: input.source ?? actor?.source,
          },
        },
        { jobId: `audit-log-${auditLogId}` },
      )
    } catch (err) {
      logger.warn(
        {
          err: normalizeError(err),
          workspaceId,
          userId,
          action: input.action,
          source: input.source,
        },
        "audit log enqueue failed",
      )
    }
  }
}

export const auditService = new AuditService()

const globalForAudit = globalThis as typeof globalThis & {
  __chatbotxAuditRecord?: typeof auditService.record
}

globalForAudit.__chatbotxAuditRecord = (input) => auditService.record(input)
