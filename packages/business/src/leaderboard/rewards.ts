import { leaderboardRepository } from "@chatbotx.io/database/repositories"
import type { LeaderboardModel } from "@chatbotx.io/database/types"
import {
  IntegrationJobAction,
  integrationQueue,
  LeaderboardJobAction,
  leaderboardQueue,
} from "@chatbotx.io/worker-config"
import { contactInboxService } from "../contact-inbox/service"
import { conversationService } from "../conversation/service"
import { ChatbotXException, notFoundException } from "../errors"
import { logger } from "../logger"
import { leaderboardRankingService } from "./ranking"

const REWARD_RETRY_DELAY_MS = 30_000

/**
 * Starts `flowId` for one contact on the leaderboard's host channel (its DM
 * conversation). Returns false when the contact has no conversation there.
 */
export async function sendLeaderboardFlow(input: {
  leaderboard: Pick<LeaderboardModel, "workspaceId" | "inboxId">
  contactId: string
  flowId: string
  /** Fixed queue job id, so a re-send for the same purpose is dropped. */
  jobId?: string
}): Promise<boolean> {
  const conversation = await conversationService.findDMByContact({
    workspaceId: input.leaderboard.workspaceId,
    contactId: input.contactId,
  })
  if (!conversation) {
    return false
  }
  const contactInboxes = await contactInboxService.listByContactId({
    workspaceId: input.leaderboard.workspaceId,
    contactId: input.contactId,
  })
  const contactInbox =
    contactInboxes.find(
      (candidate) => candidate.inboxId === input.leaderboard.inboxId,
    ) ?? contactInboxes[0]
  if (!contactInbox) {
    return false
  }
  await integrationQueue.add(
    IntegrationJobAction.sendFlow,
    {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        flowId: input.flowId,
      },
    },
    input.jobId ? { jobId: input.jobId } : undefined,
  )
  return true
}

/**
 * "Trigger rewards": sends the reward flow to the top N (banned excluded) of
 * a finished leaderboard, once per winner.
 *
 * - `claimRewards` stamps `rewardsTriggeredAt`, which closes the board to
 *   late events, so the winners read next are final and identical on every
 *   run.
 * - Each winner is claimed atomically (`pending`) before its flow is queued:
 *   a double click, the automatic job racing an admin, or a retry can never
 *   send one winner twice.
 * - A run that stopped half-way is resumed by the next run (the automatic
 *   job retries on `failed`); only winners not yet recorded are sent.
 */
export async function triggerLeaderboardRewards(input: {
  workspaceId: string
  leaderboardId: string
  /**
   * Queue a background run for winners whose flow failed to queue. Set by
   * the admin/API callers; the background job itself retries by throwing.
   */
  retryFailedInBackground?: boolean
}) {
  const leaderboard = await leaderboardRepository.findByIdAndWorkspace({
    id: input.leaderboardId,
    workspaceId: input.workspaceId,
  })
  if (!leaderboard) {
    throw notFoundException("Leaderboard not found")
  }
  if (leaderboard.status !== "finished") {
    throw new ChatbotXException(
      "Rewards can only be sent after the leaderboard finishes",
      "leaderboardNotFinished",
      409,
    )
  }
  const { flowId, topN } = leaderboard.rewardSettings
  if (!flowId) {
    throw new ChatbotXException(
      "Choose a reward flow first",
      "leaderboardRewardFlowMissing",
      422,
    )
  }
  const claim = await leaderboardRepository.claimRewards({
    id: leaderboard.id,
    workspaceId: leaderboard.workspaceId,
  })
  if (!claim) {
    throw notFoundException("Leaderboard not found")
  }

  const winners = await leaderboardRankingService.top(leaderboard, topN)
  const unsent = winners.filter(
    (winner) => !(winner.contactId in claim.recipients),
  )
  if (claim.previouslyTriggered && unsent.length === 0) {
    throw new ChatbotXException(
      "Rewards were already sent",
      "leaderboardRewardsAlreadySent",
      409,
    )
  }

  let sent = 0
  const skipped: string[] = []
  const failed: string[] = []
  for (const winner of unsent) {
    const recipient = { id: leaderboard.id, contactId: winner.contactId }
    if (!(await leaderboardRepository.claimRewardRecipient(recipient))) {
      continue
    }
    let delivered: boolean
    try {
      delivered = await sendLeaderboardFlow({
        leaderboard,
        contactId: winner.contactId,
        flowId,
        jobId: `lb-reward-${leaderboard.id}-${winner.contactId}`,
      })
    } catch (err) {
      logger.error(
        { err, leaderboardId: leaderboard.id, contactId: winner.contactId },
        "failed to send leaderboard reward flow",
      )
      // Nothing was queued: release the claim so the next run sends it.
      await leaderboardRepository
        .setRewardRecipient({ ...recipient, delivery: null })
        .catch((releaseErr) => {
          logger.error(
            { err: releaseErr, leaderboardId: leaderboard.id },
            "failed to release a leaderboard reward claim",
          )
        })
      failed.push(winner.contactId)
      continue
    }
    await leaderboardRepository.setRewardRecipient({
      ...recipient,
      delivery: delivered ? "sent" : "skipped",
    })
    if (delivered) {
      sent += 1
    } else {
      skipped.push(winner.contactId)
    }
  }
  if (failed.length > 0 && input.retryFailedInBackground) {
    await leaderboardQueue
      .add(
        LeaderboardJobAction.triggerRewards,
        {
          type: LeaderboardJobAction.triggerRewards,
          data: {
            workspaceId: leaderboard.workspaceId,
            leaderboardId: leaderboard.id,
          },
        },
        {
          jobId: `lb-rewards-retry-${leaderboard.id}`,
          delay: REWARD_RETRY_DELAY_MS,
          removeOnComplete: true,
        },
      )
      .catch((err) => {
        logger.error(
          { err, leaderboardId: leaderboard.id },
          "failed to queue the leaderboard reward retry",
        )
      })
  }
  return {
    winners: winners.map((winner) => ({
      rank: winner.rank,
      contactId: winner.contactId,
      score: winner.score,
    })),
    sent,
    skipped,
    failed,
  }
}
