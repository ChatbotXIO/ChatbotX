import type { MinigamePlayResult } from "@chatbotx.io/business/minigame"
import type { MinigamePrizeSettings } from "@chatbotx.io/database/partials"
import type { LuckyWheelSegment } from "@chatbotx.io/minigame-ui"

const NON_WINNING_SEGMENT_ID = "__nonWinning__"

/**
 * Builds the wheel's wedges from prize settings — always `prizes.length + 1`
 * segments, since `nonWinning` is guaranteed reachable (winRates + loseRate
 * sum to exactly 100%, enforced by `minigamePrizeSettingsSchema`).
 */
export function buildLuckyWheelSegments(
  prizeSettings: MinigamePrizeSettings,
): LuckyWheelSegment[] {
  return [
    ...prizeSettings.prizes.map((prize) => ({
      id: prize.id,
      label: prize.name,
      iconUrl: prize.icon.url,
    })),
    {
      id: NON_WINNING_SEGMENT_ID,
      label: prizeSettings.nonWinning.title,
      iconUrl: prizeSettings.nonWinning.loseImage.url,
      isNonWinning: true,
    },
  ]
}

/** Resolves which wedge a play result landed on, for the spin-to-angle math. */
export function getLuckyWheelTargetSegmentIndex(
  segments: LuckyWheelSegment[],
  result: MinigamePlayResult,
): number {
  if (result.type === "prize") {
    const index = segments.findIndex(
      (segment) => segment.id === result.prize.id,
    )
    if (index >= 0) {
      return index
    }
  }
  return segments.length - 1
}
