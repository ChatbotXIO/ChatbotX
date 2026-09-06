import type { MinigameModel } from "@chatbotx.io/database/types"

/**
 * Whether a minigame is inside its configured campaign window.
 *
 * `Minigame.enabled` and this window are two independent switches, and
 * `enabled` alone is not enough: a minigame whose `playedAtTo` has passed
 * stays `enabled` forever, so every surface that acts on behalf of a player
 * (recording a play, crediting a share referral, running the Sharing Node)
 * has to check both or it keeps working after the campaign ended.
 */
export function isMinigameWithinPlayWindow(
  minigame: Pick<MinigameModel, "generalSettings">,
  now: Date = new Date(),
): boolean {
  const { playedAtFrom, playedAtTo } = minigame.generalSettings
  return now >= new Date(playedAtFrom) && now <= new Date(playedAtTo)
}
