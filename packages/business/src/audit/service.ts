import { createId } from "@chatbotx.io/utils"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../logger"
import { getAuditActor } from "./context"
import { AUDIT_SERVICE, type AuditRecordWithService } from "./service-tag"

export type AuditRecordInput = {
  action: string
  detail: string
  userId?: string
  workspaceId?: string
  ipAddress?: string
  userAgent?: string
  source?: string
}

/**
 * Opt-in: also write every audit record to the process log as an `AUDIT <action>`
 * line. The `audit_log` table is only written on the enterprise/cloud editions
 * (the worker drops the job on community), so self-hosters on the community
 * edition otherwise keep no trail at all. Off unless `AUDIT_LOG_STDOUT=true`.
 */
export const isAuditLogStdoutEnabled = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => env.AUDIT_LOG_STDOUT === "true"

// `userAgent` is client-supplied; bound it so one request cannot bloat a log line.
const MAX_USER_AGENT_LOG_CHARS = 256

class AuditService {
  async record(input: AuditRecordInput & AuditRecordWithService) {
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
    const ipAddress = input.ipAddress ?? actor?.ipAddress
    const userAgent = input.userAgent ?? actor?.userAgent
    const source = input.source ?? actor?.source

    // Emitted here, before the job is enqueued, so the line exists regardless of
    // edition (the community worker discards the job) and of Redis availability.
    //
    // `input.detail` is deliberately NOT logged. It is a free-form string built
    // at every call site, so it can carry names, e-mail addresses or message
    // text, and no generic allowlist is possible. Only identifiers, the action
    // and request metadata are emitted. `userId`, `ipAddress` and `userAgent`
    // are personal data: whoever enables this flag owns the retention and
    // access control of the resulting log stream.
    if (isAuditLogStdoutEnabled()) {
      // `<Service>.<action>` (e.g. `WorkingHoursService.delete`): without `detail`
      // the bare verb says someone deleted, not what. Log-only: the job below and
      // the `audit_log` row keep `input.action` unchanged. Records raised outside
      // `BaseService.audit()` carry no service and log the bare action.
      const service = input[AUDIT_SERVICE]
      const loggedAction = service ? `${service}.${input.action}` : input.action
      logger.info(
        {
          audit: {
            auditLogId,
            action: loggedAction,
            userId,
            workspaceId,
            ipAddress,
            userAgent: userAgent?.slice(0, MAX_USER_AGENT_LOG_CHARS),
            source,
          },
        },
        `AUDIT ${loggedAction}`,
      )
    }

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
            ipAddress,
            userAgent,
            source,
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
