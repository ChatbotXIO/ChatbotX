import { integrationSmtpService } from "@chatbotx.io/business"
import type { SmtpAuthValue } from "@chatbotx.io/integration-smtp"
import {
  fetchNewMessages,
  resolveImapConnection,
} from "@chatbotx.io/integration-smtp/imap"
import { getChildLogger } from "@chatbotx.io/logger"
import { distributedLock, isLockAcquisitionError } from "@chatbotx.io/redis"
import {
  buildSmtpInboundMessageJobId,
  IntegrationJobAction,
  type IntegrationJobPollSmtpInbox,
  integrationQueue,
} from "@chatbotx.io/worker-config"

const LOCK_TTL_SECONDS = 120
// A poll already in flight means skip, not queue up behind it.
const LOCK_ACQUIRE_RETRY_SECONDS = 1
const log = getChildLogger("smtp-poll-inbox")

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown IMAP error"

/**
 * Reads new mail for one inbox and hands each message to the shared
 * `incomingMessage` pipeline.
 *
 * Ordering matters: the cursor is advanced only AFTER every message of the
 * batch is enqueued. A crash in between re-fetches the same UIDs next poll;
 * their deterministic job ids (and the Message-ID dedup downstream) make that
 * harmless. A failure of any kind records the error and a back-off instead.
 */
export async function pollSmtpInbox(
  data: IntegrationJobPollSmtpInbox["data"],
): Promise<void> {
  const key = `smtp:imap:${data.integrationId}`
  try {
    await distributedLock.runExclusive({
      key,
      timeoutInSeconds: LOCK_TTL_SECONDS,
      retryTimeoutInSeconds: LOCK_ACQUIRE_RETRY_SECONDS,
      fn: () => pollLocked(data),
    })
  } catch (err) {
    if (isLockAcquisitionError(err, key)) {
      log.info(
        { integrationId: data.integrationId },
        "IMAP poll already running",
      )
      return
    }
    throw err
  }
}

const pollLocked = async (
  data: IntegrationJobPollSmtpInbox["data"],
): Promise<void> => {
  const row = await integrationSmtpService.findForPoll(data.integrationId)
  if (!(row?.imapEnabled && row.imapHost && row.imapPort)) {
    return
  }

  try {
    const result = await fetchNewMessages({
      connection: resolveImapConnection(row.auth as SmtpAuthValue, {
        host: row.imapHost,
        port: row.imapPort,
        mailbox: row.imapMailbox,
      }),
      cursor: { uidValidity: row.imapUidValidity, lastUid: row.imapLastUid },
    })

    for (const mail of result.messages) {
      await integrationQueue.add(
        IntegrationJobAction.incomingMessage,
        {
          type: IntegrationJobAction.incomingMessage,
          data: {
            integrationType: "smtp",
            integrationIdentifier: row.inboxId,
            payload: { raw: mail.raw.toString("base64") },
          },
        },
        {
          jobId: buildSmtpInboundMessageJobId({
            inboxId: row.inboxId,
            uidValidity: result.cursor.uidValidity,
            uid: mail.uid,
          }),
          removeOnComplete: { age: 24 * 3600 },
        },
      )
    }

    await integrationSmtpService.recordPollSuccess({
      id: row.id,
      uidValidity: result.cursor.uidValidity,
      lastUid: result.cursor.lastUid,
    })
    if (result.messages.length > 0) {
      log.info(
        { integrationId: row.id, count: result.messages.length },
        "IMAP mail enqueued",
      )
    }
  } catch (err) {
    log.warn({ err, integrationId: row.id }, "IMAP poll failed")
    await integrationSmtpService.recordPollFailure({
      id: row.id,
      error: errorMessage(err),
    })
  }
}
