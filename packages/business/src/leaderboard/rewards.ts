import { leaderboardRepository } from "@chatbotx.io/database/repositories"
import type { LeaderboardModel } from "@chatbotx.io/database/types"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { contactInboxService } from "../contact-inbox/service"
import { conversationService } from "../conversation/service"
import { ChatbotXException, notFoundException } from "../errors"
import { logger } from "../logger"
import { leaderboardRankingService } from "./ranking"

/**
 * Starts `flowId` for one contact on the leaderboard's host channel (its DM
 * conversation). Returns false when the contact has no conversation there.
 */
export async function sendLeaderboardFlow(input: {
  leaderboard: Pick<LeaderboardModel, "workspaceId" | "inboxId">
  contactId: string
  flowId: string
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
  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: conversation.id,
      contactInboxId: contactInbox.id,
      flowId: input.flowId,
    },
  })
  return true
}

/**
 * "Trigger rewards": sends the reward flow to the top N (banned excluded) of
 * a finished leaderboard, once. `rewardsTriggeredAt` is stamped first so a
 * double click or a retried job never sends twice.
 */
export async function triggerLeaderboardRewards(input: {
  workspaceId: string
  leaderboardId: string
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
  if (leaderboard.rewardsTriggeredAt) {
    throw new ChatbotXException(
      "Rewards were already sent",
      "leaderboardRewardsAlreadySent",
      409,
    )
  }
  await leaderboardRepository.update(
    { id: leaderboard.id, workspaceId: leaderboard.workspaceId },
    { rewardsTriggeredAt: new Date() },
  )

  const winners = await leaderboardRankingService.top(leaderboard, topN)
  let sent = 0
  const skipped: string[] = []
  for (const winner of winners) {
    try {
      if (
        await sendLeaderboardFlow({
          leaderboard,
          contactId: winner.contactId,
          flowId,
        })
      ) {
        sent += 1
      } else {
        skipped.push(winner.contactId)
      }
    } catch (err) {
      logger.error(
        { err, leaderboardId: leaderboard.id, contactId: winner.contactId },
        "failed to send leaderboard reward flow",
      )
      skipped.push(winner.contactId)
    }
  }
  return {
    winners: winners.map((winner) => ({
      rank: winner.rank,
      contactId: winner.contactId,
      score: winner.score,
    })),
    sent,
    skipped,
  }
}
