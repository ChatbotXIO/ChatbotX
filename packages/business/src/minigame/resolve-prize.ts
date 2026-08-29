import type {
  MinigamePrizeItem,
  MinigamePrizeSettings,
} from "@chatbotx.io/database/partials"

export type MinigamePlayResult =
  | { type: "prize"; prize: MinigamePrizeItem }
  | { type: "nonWinning" }

const MAX_PERCENT = 100

/**
 * `prizeSettings` is only ever persisted once its winRates + nonWinning.loseRate
 * sum to exactly 100 (enforced by `minigamePrizeSettingsSchema`'s `.refine`),
 * so any roll not claimed by a prize necessarily falls into `nonWinning`.
 */
export function resolveMinigamePrize(
  prizeSettings: MinigamePrizeSettings,
): MinigamePlayResult {
  const roll = Math.random() * MAX_PERCENT
  let cumulative = 0
  for (const prize of prizeSettings.prizes) {
    cumulative += prize.winRate
    if (roll < cumulative) {
      return { type: "prize", prize }
    }
  }
  return { type: "nonWinning" }
}
