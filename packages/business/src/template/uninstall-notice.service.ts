import { templateUninstallStateRepository } from "@chatbotx.io/database/repositories"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { SYSTEM_ACTOR } from "../audit/actor"
import { logger } from "../logger"

const NOTICE_BATCH = 100

const wording = {
  publisher:
    "The template publisher uninstalled a template from this workspace",
  installer: "A workspace member uninstalled a template from this workspace",
} as const

/**
 * Exactly one audit summary per uninstall operation, sent under the
 * operation's stable `auditLogId` (the audit handler dedupes by id) and marked
 * delivered only after the enqueue succeeded. The sweep redelivers. Community
 * edition drops the audit row, which is why the installs-page banner exists.
 */
export const templateUninstallNoticeService = {
  async deliverPending(): Promise<number> {
    const operations =
      await templateUninstallStateRepository.listUndeliveredNotices(
        NOTICE_BATCH,
      )
    let delivered = 0
    for (const operation of operations) {
      try {
        await defaultQueue.add(
          DefaultJobAction.sendAuditLog,
          {
            type: DefaultJobAction.sendAuditLog,
            data: {
              auditLogId: operation.auditLogId,
              userId: operation.requestedBy ?? SYSTEM_ACTOR,
              workspaceId: operation.workspaceId,
              action: "template.uninstall",
              detail: `${wording[operation.requestedByKind]} (${operation.state}): ${JSON.stringify(operation.counts ?? {})}`,
              source: "template-uninstall",
            },
          },
          { jobId: `audit-log-${operation.auditLogId}` },
        )
        await templateUninstallStateRepository.markNoticeDelivered(operation.id)
        delivered++
      } catch (err) {
        logger.warn(
          { err, operationId: operation.id },
          "Template uninstall notice enqueue failed",
        )
      }
    }
    return delivered
  },
}
