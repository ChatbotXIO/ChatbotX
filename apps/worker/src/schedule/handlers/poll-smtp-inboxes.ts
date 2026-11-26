import { integrationSmtpService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  buildSmtpImapPollJobId,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"

const BATCH = 200
const log = getChildLogger("poll-smtp-inboxes")

/**
 * Runs every minute (`register-schedules.ts`). Enqueues one `pollSmtpInbox` job
 * per IMAP-enabled inbox that is due. The per-inbox job id keeps a slow poll
 * from being queued twice; the poll itself takes the per-inbox lock.
 */
export async function pollSmtpInboxes(): Promise<void> {
  const due = await integrationSmtpService.listDueImapInboxes({ limit: BATCH })
  if (due.length === 0) {
    return
  }

  for (const inbox of due) {
    try {
      await integrationQueue.add(
        IntegrationJobAction.pollSmtpInbox,
        {
          type: IntegrationJobAction.pollSmtpInbox,
          data: { integrationId: inbox.id, workspaceId: inbox.workspaceId },
        },
        {
          jobId: buildSmtpImapPollJobId(inbox.id),
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: true,
        },
      )
    } catch (err) {
      log.error(
        { err, integrationId: inbox.id },
        "pollSmtpInboxes: enqueue failed",
      )
    }
  }
}
