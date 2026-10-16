import { LEADERBOARD_ACTIONS_BY_STATUS } from "@chatbotx.io/business/leaderboard"
import type { LeaderboardModel } from "@chatbotx.io/database/types"
import { buildLeaderboardViewUrl } from "./view-url"

type LeaderboardWithStats = LeaderboardModel & {
  stats?: { participants: number; totalPoints: number; newToday: number }
}

/** Shapes a leaderboard row for the public API and the builder alike. */
export const toLeaderboardResource = (leaderboard: LeaderboardWithStats) => ({
  id: leaderboard.id,
  name: leaderboard.name,
  description: leaderboard.description,
  coverImageUrl: leaderboard.coverImageUrl,
  startsAt: leaderboard.startsAt,
  endsAt: leaderboard.endsAt,
  status: leaderboard.status,
  platform: leaderboard.platform,
  inboxId: leaderboard.inboxId,
  minigameId: leaderboard.minigameId,
  scope: leaderboard.scope,
  rules: leaderboard.rules,
  followersOnly: leaderboard.followersOnly,
  tagIds: leaderboard.tagIds,
  resetTime: leaderboard.resetTime,
  cooldownSeconds: leaderboard.cooldownSeconds,
  referralWelcomeFlowId: leaderboard.referralWelcomeFlowId,
  rewardSettings: leaderboard.rewardSettings,
  rewardsTriggeredAt: leaderboard.rewardsTriggeredAt,
  finishedAt: leaderboard.finishedAt,
  createdAt: leaderboard.createdAt,
  updatedAt: leaderboard.updatedAt,
  stats: leaderboard.stats ?? {
    participants: 0,
    totalPoints: 0,
    newToday: 0,
  },
  availableActions: [...LEADERBOARD_ACTIONS_BY_STATUS[leaderboard.status]],
  viewUrl: buildLeaderboardViewUrl(leaderboard.id),
})
