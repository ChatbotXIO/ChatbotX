import { db } from "@chatbotx.io/database/client"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js"
import { logger } from "../logger"
import { enqueueLeaderboardAward } from "./enqueue"

const shortHash = (value: string) =>
  bytesToHex(sha256(utf8ToBytes(value))).slice(0, 16)

/**
 * Scores an Email Topic open/click for email leaderboards. Call it AFTER
 * `emailTopicAnalyticsService.recordOpen/recordClick`, so the recipient's
 * first-open/first-click time is set: that time is the event time, which keeps
 * repeat opens (and repeat clicks of the same link) idempotent.
 *
 * Only emails sent with an Email Topic score: every email now has a tracking
 * token (for contact activity), but a topic-less one never scored before and
 * still does not. The recipient row does not record which SMTP
 * integration sent the email, so every SMTP inbox of the workspace that runs
 * a live email leaderboard is offered the event (the enqueue pre-check makes
 * this one cache read per SMTP inbox). Never throws.
 */
export async function awardLeaderboardEmailEngagement(input: {
  token: string
  kind: "open" | "click"
  /** Destination of the clicked button, when known; each link scores once. */
  link?: string | null
}): Promise<void> {
  try {
    const recipient = await db.query.analyticsEmailTopicModel.findFirst({
      where: { token: input.token },
      columns: {
        id: true,
        workspaceId: true,
        contactId: true,
        firstSeenAt: true,
        firstClickedAt: true,
        topicId: true,
        topicReferenceId: true,
      },
    })
    if (!recipient?.contactId) {
      return
    }
    // `topicReferenceId` survives the topic's deletion; rows created before
    // that snapshot column only have the live `topicId`.
    if (!(recipient.topicReferenceId ?? recipient.topicId)) {
      return
    }
    const eventAt =
      input.kind === "open" ? recipient.firstSeenAt : recipient.firstClickedAt
    if (!eventAt) {
      return
    }
    const smtpInboxes = await db.query.integrationSmtpModel.findMany({
      where: { workspaceId: recipient.workspaceId },
      columns: { inboxId: true },
    })
    const sourceRef =
      input.kind === "click" && input.link
        ? `${recipient.id}:${shortHash(input.link)}`
        : recipient.id
    for (const { inboxId } of smtpInboxes) {
      await enqueueLeaderboardAward({
        workspaceId: recipient.workspaceId,
        contactId: recipient.contactId,
        inboxId,
        rule: input.kind === "open" ? "emailOpen" : "emailClick",
        sourceRef,
        eventAt,
      })
    }
  } catch (err) {
    logger.warn(
      { err, kind: input.kind },
      "failed to award leaderboard email engagement",
    )
  }
}
