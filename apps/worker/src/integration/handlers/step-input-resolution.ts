import { conversationService, workspaceService } from "@chatbotx.io/business"
import { smartDelayService } from "@chatbotx.io/business/smart-delay"
import {
  type ConversationAttributes,
  smartDelayStatuses,
  smartDelayTypes,
} from "@chatbotx.io/database/partials"
import { stepInputResolutionPayload } from "@chatbotx.io/flow-config"
import type {
  IntegrationJobResolveStepInput,
  IntegrationJobResumeStepInputTimeout,
} from "@chatbotx.io/worker-config"
import { detectConversationAndContactInbox } from "../../lib/db"
import { logger } from "../../lib/logger"
import { runStepChallenge } from "./challenge"
import { requeueClaimedRunOrLog } from "./smart-delay"

/**
 * Ends a pending step input without a typed answer (the contact tapped Skip,
 * or the step's timer ran out) by re-entering the step with the reason. The
 * step handler claims the challenge atomically, so a duplicate tap, a late
 * timer or a reply racing either one resolves exactly once.
 */
export async function runStepInputResolution(
  data: IntegrationJobResolveStepInput["data"],
): Promise<void> {
  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId: data.conversationId,
      contactInboxId: data.contactInboxId,
    })

  const challenge = (
    conversation.additionalAttributes as ConversationAttributes | undefined
  )?.challenge
  if (
    challenge?.type !== "step" ||
    challenge.data.challengeId !== data.challengeId
  ) {
    logger.info(
      {
        conversationId: conversation.id,
        challengeId: data.challengeId,
        reason: data.reason,
      },
      "runStepInputResolution: challenge already resolved or replaced, ignoring",
    )
    return
  }

  // The job may have waited in the queue (or behind a timer) since the
  // webhook gate that enqueued it ran, so workspace and bot state are
  // re-checked here.
  const workspace = await workspaceService.findById({
    id: conversation.workspaceId,
  })
  if (
    !(
      workspaceService.isActiveNow(workspace) &&
      (await conversationService.ensureActive(conversation))
    )
  ) {
    logger.info(
      { conversationId: conversation.id, reason: data.reason },
      "runStepInputResolution: workspace or bot inactive, leaving the challenge",
    )
    return
  }

  await runStepChallenge({
    conversation,
    contactInbox,
    challenge,
    messageId: data.messageId,
    messageCreatedAt: data.messageCreatedAt,
    // Only the contact's own tap counts as contact-initiated; a timer is not.
    startedByContactMessage: data.messageId !== undefined,
    resolutionReason: data.reason,
    triggerHandler: "runStepInputResolution",
    onTargetUnavailable: async (error) => {
      // The flow was edited or republished since the question was asked: drop
      // the challenge, or it would block keywords and AI for this contact.
      await conversationService.consumeChallenge({
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        stepId: challenge.data.stepId,
        challengeId: data.challengeId,
      })
      logger.warn(
        {
          err: error,
          conversationId: conversation.id,
          stepId: challenge.data.stepId,
        },
        "runStepInputResolution: step no longer exists, cleared the challenge",
      )
    },
  })
}

export async function runStepInputTimeoutResume(
  data: IntegrationJobResumeStepInputTimeout["data"],
): Promise<void> {
  const row = await smartDelayService.findById({ id: data.smartDelayId })
  if (
    !row ||
    row.type !== smartDelayTypes.enum.stepInputTimeout ||
    row.status !== smartDelayStatuses.enum.scheduled
  ) {
    return
  }
  // A restarted timer supersedes this delayed job; the new job fires later.
  if (row.triggerAt.getTime() > Date.now()) {
    return
  }

  const payload = stepInputResolutionPayload.safeParse(row.metadata)
  if (!payload.success) {
    await smartDelayService.claimForRun({
      id: row.id,
      to: smartDelayStatuses.enum.canceled,
      observedTriggerAt: row.triggerAt,
    })
    logger.warn(
      { smartDelayId: row.id },
      "Step input timeout canceled: unreadable payload",
    )
    return
  }

  // Tied to the deadline read above: between the read and this claim the
  // conversation may have been re-asked, which re-arms this same row for a
  // later deadline. That replacement timer must not be consumed by this job.
  const completed = await smartDelayService.claimForRun({
    id: row.id,
    to: smartDelayStatuses.enum.completed,
    observedTriggerAt: row.triggerAt,
  })
  if (!completed) {
    return
  }

  // claimForRun is the concurrency guard. Resolution runs inline, so restore
  // the row before letting BullMQ retry, or a transient failure drops the
  // timeout.
  try {
    await runStepInputResolution({
      conversationId: row.conversationId,
      contactInboxId: row.contactInboxId,
      challengeId: payload.data.challengeId,
      reason: payload.data.reason,
    })
  } catch (error) {
    await requeueClaimedRunOrLog(
      row.id,
      "Failed to requeue a claimed step input timeout after failure",
    )
    throw error
  }
}
