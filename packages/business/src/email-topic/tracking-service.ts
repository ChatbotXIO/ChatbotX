import {
  type CreateEmailRecipientInput,
  type EmailRecipientTransition,
  type EmailTopicCounterIncrement,
  emailTopicAnalyticsService,
} from "@chatbotx.io/analytics"
import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type {
  ContactActivityType,
  EmailTrackingPhase,
} from "@chatbotx.io/database/partials"
import {
  enqueueIntegrationJob,
  IntegrationJobAction,
} from "@chatbotx.io/worker-config"
import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js"
import { contactActivityService } from "../contact-activity/service"
import { logger } from "../logger"

/**
 * One repair job per (recipient, phase). The token is the recipient's
 * open/click credential, so only a digest of it goes into the id (job ids
 * appear in Redis keys and failure logs). Contains no `:` (BullMQ rejects it).
 */
export const emailTrackingTransitionJobId = (
  token: string,
  phase: EmailTrackingPhase,
): string =>
  `email-tracking-${bytesToHex(sha256(utf8ToBytes(token))).slice(0, 32)}-${phase}`

type RecordedPhase = {
  activityType: ContactActivityType
  transition: (
    token: string,
    tx: DatabaseClient,
  ) => Promise<EmailRecipientTransition | null>
}

const PHASES: Record<EmailTrackingPhase, RecordedPhase> = {
  delivered: {
    activityType: "messageDelivered",
    transition: (token, tx) =>
      emailTopicAnalyticsService.markDelivered(token, tx),
  },
  opened: {
    activityType: "messageOpened",
    transition: (token, tx) => emailTopicAnalyticsService.recordOpen(token, tx),
  },
  clicked: {
    activityType: "messageClicked",
    transition: (token, tx) =>
      emailTopicAnalyticsService.recordClick(token, tx),
  },
}

type PhaseActivity = {
  activityType: ContactActivityType
  contactId: string | null
  /** Applied after the activity write, as the transaction's last statement. */
  counterIncrement: EmailTopicCounterIncrement | null
  occurredAt: Date
  topicReferenceId: string | null
  workspaceId: string
}

/**
 * Orchestrates the email recipient lifecycle: the raw counters, the first-time
 * transition, the topic counter and the contact's activity row all commit in
 * one transaction, so none can exist without the others. It lives in business
 * (analytics must not depend on business) and is the only writer of the four
 * email activity phases.
 */
class EmailTrackingService {
  /** Creates the recipient (and its token) and records "sent". */
  async createRecipient(
    input: CreateEmailRecipientInput,
  ): Promise<{ token: string }> {
    return await db.transaction(async (tx) => {
      const recipient = await emailTopicAnalyticsService.createRecipient(
        input,
        tx,
      )
      await this.recordActivity(
        {
          activityType: "messageSent",
          contactId: recipient.contactId,
          counterIncrement: recipient.counterIncrement,
          occurredAt: new Date(),
          topicReferenceId: recipient.topicReferenceId,
          workspaceId: recipient.workspaceId,
        },
        tx,
      )
      return { token: recipient.token }
    })
  }

  /**
   * Applies one recipient phase (delivered / opened / clicked). Idempotent: a
   * repeat bumps only the raw counters, and the activity row is keyed so a
   * replay (including the repair job) is a no-op.
   */
  async recordTransition(input: {
    phase: EmailTrackingPhase
    token: string
  }): Promise<void> {
    const phase = PHASES[input.phase]
    await db.transaction(async (tx) => {
      const transition = await phase.transition(input.token, tx)
      if (!transition) {
        return
      }
      await this.recordActivity(
        {
          activityType: phase.activityType,
          contactId: transition.contactId,
          counterIncrement: transition.counterIncrement,
          occurredAt: transition.occurredAt,
          topicReferenceId: transition.topicReferenceId,
          workspaceId: transition.workspaceId,
        },
        tx,
      )
    })
  }

  /**
   * Same as `recordTransition`, for callers that must not fail (an open pixel,
   * a click redirect, the step after the SMTP server already accepted the
   * mail). A failure is logged and handed to the repair job, which retries only
   * this transaction; it never throws.
   */
  async recordTransitionOrEnqueueRepair(input: {
    phase: EmailTrackingPhase
    token: string
    /** Lets the worker's blocked-owner guard attribute the repair job. */
    workspaceId?: string
    /** The clicked destination, forwarded for the repair's leaderboard award. */
    link?: string
  }): Promise<void> {
    try {
      await this.recordTransition({ phase: input.phase, token: input.token })
    } catch (err) {
      logger.error(
        { err, phase: input.phase },
        "email-tracking: transition failed, enqueueing repair",
      )
      await enqueueIntegrationJob(
        {
          type: IntegrationJobAction.recordEmailTrackingTransition,
          data: {
            phase: input.phase,
            token: input.token,
            workspaceId: input.workspaceId,
            link: input.link,
          },
        },
        { jobId: emailTrackingTransitionJobId(input.token, input.phase) },
      ).catch((enqueueErr) =>
        logger.error(
          { err: enqueueErr, phase: input.phase },
          "email-tracking: failed to enqueue repair",
        ),
      )
    }
  }

  // A recipient whose contact was deleted (nullable contactId) has no one to
  // attribute the activity to, so only the tracking counters move. The topic
  // counter is deliberately the last statement: it is one hot row per topic
  // that a topic delete also locks, so it is held for as short a time as
  // possible and always taken after every other lock this transaction needs.
  private async recordActivity(
    activity: PhaseActivity,
    tx: DatabaseClient,
  ): Promise<void> {
    if (activity.contactId) {
      await contactActivityService.record({
        entries: [
          {
            activityType: activity.activityType,
            contactId: activity.contactId,
            occurredAt: activity.occurredAt,
            referenceId: activity.topicReferenceId ?? undefined,
            referenceType: "emailTopic",
          },
        ],
        tx,
        workspaceId: activity.workspaceId,
      })
    }
    if (activity.counterIncrement) {
      await emailTopicAnalyticsService.incrementTopicCounter(
        activity.counterIncrement,
        tx,
      )
    }
  }
}

export const emailTrackingService = new EmailTrackingService()
