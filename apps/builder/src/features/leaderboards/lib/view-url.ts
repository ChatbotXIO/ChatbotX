import { getBrokerOrigin } from "@/lib/oauth-broker"

/** Variable the flow engine fills with the contact's signed view token. */
export const LEADERBOARD_VIEW_TOKEN_VARIABLE = "{{leaderboard_view_token}}"

/**
 * The public leaderboard link the builder's "Copy link" shows and the public
 * API returns, so the two cannot drift. `token` is either the
 * `{{leaderboard_view_token}}` variable (filled per contact when a flow sends
 * it) or an already-signed token.
 */
export const buildLeaderboardViewUrl = (
  leaderboardId: string,
  token: string = LEADERBOARD_VIEW_TOKEN_VARIABLE,
): string =>
  `${getBrokerOrigin()}/leaderboards?leaderboardId=${leaderboardId}&token=${token}`
