/**
 * BullMQ job ids for the SMTP IMAP pipeline. A job id is reserved until the job
 * is REMOVED, so these are deterministic and colon-free (`:` separates Redis key
 * fields). Producers also drop the job on completion/failure so an id never
 * lingers and blocks the next poll.
 */

/** One poll in flight per inbox: a second enqueue while it runs is a no-op. */
export const buildSmtpImapPollJobId = (integrationId: string): string =>
  `smtp-imap-poll-${integrationId}`

/**
 * One inbound mail, identified by its position in the mailbox. Re-enqueueing
 * the same UID (a poll retried after a partial failure) is deduplicated.
 */
export const buildSmtpInboundMessageJobId = (input: {
  inboxId: string
  uidValidity: number
  uid: number
}): string => `smtp-in-${input.inboxId}-${input.uidValidity}-${input.uid}`
