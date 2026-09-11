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
      // Every authenticated caller now supplies an actor: session-based
      // callers via the explicit `userId`/`workspaceId` input, and
      // workspace-token (Public API) callers via `withAuditContext` in
      // `workspaceTokenAuthMidddleware`, which attributes the action to the
      // workspace owner. Reaching this branch means some call site invoked
      // `this.audit(...)` outside both — a real bug, not an expected path —
      // so this is `warn`, not `debug`.
      logger.warn(
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
