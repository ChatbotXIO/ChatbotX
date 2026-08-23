import type { MinigamePrizeSettings } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { resolveMinigamePrize } from "../src/minigame/resolve-prize"

const SAMPLE_SIZE = 200_000
// 200k trials keeps the binomial standard deviation for a 25% bucket around
// ~0.1 percentage point, so a 2-point absolute tolerance is generous enough
// to never flake yet tight enough to catch a real off-by-one/scaling bug.
const TOLERANCE_PERCENTAGE_POINTS = 2

function makeSettings(
  winRates: number[],
  loseRate: number,
): MinigamePrizeSettings {
  return {
    prizes: winRates.map((winRate, index) => ({
      id: `prize-${index}`,
      name: `Prize ${index}`,
      icon: { mode: "file", url: "" },
      winRate,
      winMessage: { enabled: false, mode: "text", text: "" },
    })),
    nonWinning: {
      title: "Non-winning",
      loseRate,
      loseImage: { mode: "file", url: "" },
      loseMessage: { enabled: false, mode: "text", text: "" },
    },
  }
}

function draw(settings: MinigamePrizeSettings, times: number) {
  const counts: Record<string, number> = { nonWinning: 0 }
  for (const prize of settings.prizes) {
    counts[prize.id] = 0
  }
  for (let i = 0; i < times; i++) {
    const result = resolveMinigamePrize(settings)
    if (result.type === "prize") {
      counts[result.prize.id] += 1
    } else {
      counts.nonWinning += 1
    }
  }
  return counts
}

describe("resolveMinigamePrize — win/lose rate correctness", () => {
  test("each prize wins at approximately its configured winRate", () => {
    const settings = makeSettings([25, 25, 25], 25)
    const counts = draw(settings, SAMPLE_SIZE)

    for (const prize of settings.prizes) {
      const observedPercent = (counts[prize.id] / SAMPLE_SIZE) * 100
      expect(observedPercent).toBeGreaterThan(
        prize.winRate - TOLERANCE_PERCENTAGE_POINTS,
      )
      expect(observedPercent).toBeLessThan(
        prize.winRate + TOLERANCE_PERCENTAGE_POINTS,
      )
    }
    const observedLosePercent = (counts.nonWinning / SAMPLE_SIZE) * 100
    expect(observedLosePercent).toBeGreaterThan(
      25 - TOLERANCE_PERCENTAGE_POINTS,
    )
    expect(observedLosePercent).toBeLessThan(25 + TOLERANCE_PERCENTAGE_POINTS)
  })

  test("uneven winRates are each honored independently, not just their sum", () => {
    const settings = makeSettings([5, 15, 40], 40)
    const counts = draw(settings, SAMPLE_SIZE)

    const expectedByPrizeId: Record<string, number> = {
      "prize-0": 5,
      "prize-1": 15,
      "prize-2": 40,
    }
    for (const [prizeId, expected] of Object.entries(expectedByPrizeId)) {
      const observedPercent = (counts[prizeId] / SAMPLE_SIZE) * 100
      expect(observedPercent).toBeGreaterThan(
        expected - TOLERANCE_PERCENTAGE_POINTS,
      )
      expect(observedPercent).toBeLessThan(
        expected + TOLERANCE_PERCENTAGE_POINTS,
      )
    }
  })

  test("prize order does not change any individual prize's win rate", () => {
    const forward = makeSettings([10, 20, 30], 40)
    const reversed = makeSettings([30, 20, 10], 40)

    const forwardCounts = draw(forward, SAMPLE_SIZE)
    const reversedCounts = draw(reversed, SAMPLE_SIZE)

    // prize-0 is winRate=10 in `forward` and winRate=30 (last slot) in
    // `reversed` — compare against each settings' own winRate, not by index.
    const forwardPercentByRate = new Map(
      forward.prizes.map((p) => [
        p.winRate,
        (forwardCounts[p.id] / SAMPLE_SIZE) * 100,
      ]),
    )
    const reversedPercentByRate = new Map(
      reversed.prizes.map((p) => [
        p.winRate,
        (reversedCounts[p.id] / SAMPLE_SIZE) * 100,
      ]),
    )

    for (const winRate of [10, 20, 30]) {
      expect(forwardPercentByRate.get(winRate)).toBeGreaterThan(
        winRate - TOLERANCE_PERCENTAGE_POINTS,
      )
      expect(reversedPercentByRate.get(winRate)).toBeGreaterThan(
        winRate - TOLERANCE_PERCENTAGE_POINTS,
      )
    }
  })

  test("a winRate of 0 never wins", () => {
    const settings = makeSettings([0, 100], 0)
    const counts = draw(settings, SAMPLE_SIZE)

    expect(counts["prize-0"]).toBe(0)
    expect(counts["prize-1"]).toBe(SAMPLE_SIZE)
  })

  test("a loseRate of 0 never returns nonWinning", () => {
    const settings = makeSettings([60, 40], 0)
    const counts = draw(settings, SAMPLE_SIZE)

    expect(counts.nonWinning).toBe(0)
  })

  test("a winRate of 100 (single prize, no lose) always wins that prize", () => {
    const settings = makeSettings([100], 0)
    const counts = draw(settings, SAMPLE_SIZE)

    expect(counts["prize-0"]).toBe(SAMPLE_SIZE)
    expect(counts.nonWinning).toBe(0)
  })

  test("excluding a sold-out prize from the passed-in list shifts its share to nonWinning (documented, accepted behavior)", () => {
    const full = makeSettings([30, 20], 50)
    // Simulates what `MinigameContactService.drawPrize` does once a prize's
    // quantity hits 0: it filters that prize out before calling
    // `resolveMinigamePrize`, and by design there is no redistribution — the
    // excluded prize's winRate share is not reassigned to the remaining
    // prizes, it silently becomes part of the effective lose rate.
    const withSoldOutExcluded: MinigamePrizeSettings = {
      ...full,
      prizes: full.prizes.filter((p) => p.id !== "prize-0"),
    }

    const counts = draw(withSoldOutExcluded, SAMPLE_SIZE)
    const observedLosePercent = (counts.nonWinning / SAMPLE_SIZE) * 100

    // 50 (original loseRate) + 30 (prize-0's now-unreachable share) = 80
    expect(observedLosePercent).toBeGreaterThan(
      80 - TOLERANCE_PERCENTAGE_POINTS,
    )
    expect(observedLosePercent).toBeLessThan(80 + TOLERANCE_PERCENTAGE_POINTS)
    const observedPrize1Percent = (counts["prize-1"] / SAMPLE_SIZE) * 100
    expect(observedPrize1Percent).toBeGreaterThan(
      20 - TOLERANCE_PERCENTAGE_POINTS,
    )
    expect(observedPrize1Percent).toBeLessThan(20 + TOLERANCE_PERCENTAGE_POINTS)
  })
})
