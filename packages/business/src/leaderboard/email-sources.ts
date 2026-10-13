import { createHash } from "node:crypto"
import { db } from "@chatbotx.io/database/client"
import { logger } from "../logger"
import { enqueueLeaderboardAward } from "./enqueue"

const shortHash = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 16)

/**
 * Scores an Email Topic open/click for email leaderboards. Call it AFTER
 * `emailTopicAnalyticsService.recordOpen/recordClick`, so the recipient's
 * first-open/first-click time is set: that time is the event time, which keeps
 * repeat opens (and repeat clicks of the same link) idempotent.
 *
 * Only emails sent with an Email Topic have a tracking token, so untracked
 * emails never score. The recipient row does not record which SMTP
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
      },
    })
    if (!recipient?.contactId) {
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
