import type { z } from "zod"
import type { leaderboardActionNames } from "../schema/resource"

export type LeaderboardActionName = z.infer<typeof leaderboardActionNames>

/** Menu entries that are always offered, whatever the status. */
export type LeaderboardMenuExtra = "viewParticipants" | "copyLink"

export type LeaderboardMenuItem = LeaderboardActionName | LeaderboardMenuExtra

/** Display order of the row "⋮" menu. */
const MENU_ORDER: readonly LeaderboardMenuItem[] = [
  "edit",
  "publish",
  "start",
  "pause",
  "viewParticipants",
  "copyLink",
  "export",
  "triggerRewards",
  "finish",
  "resetPoints",
  "delete",
]

/** Danger actions rendered in red after a separator. */
export const DANGER_MENU_ITEMS: readonly LeaderboardMenuItem[] = [
  "resetPoints",
  "delete",
]

/**
 * The row menu for a leaderboard: exactly the actions its status allows
 * (`availableActions`, computed server-side from
 * `LEADERBOARD_ACTIONS_BY_STATUS`) plus "View participants" and "Copy
 * public link", in a stable order.
 */
export function buildLeaderboardMenu(
  availableActions: readonly LeaderboardActionName[],
): LeaderboardMenuItem[] {
  const allowed = new Set<LeaderboardMenuItem>([
    ...availableActions,
    "viewParticipants",
    "copyLink",
  ])
  return MENU_ORDER.filter((item) => allowed.has(item))
}
