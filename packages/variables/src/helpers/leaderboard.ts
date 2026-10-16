import { findLeaderboardReferrerName } from "@chatbotx.io/business/leaderboard"

export const getLeaderboardReferrerName = async (
  contactId: string,
  workspaceId: string,
): Promise<string | null> =>
  await findLeaderboardReferrerName({ contactId, workspaceId })
