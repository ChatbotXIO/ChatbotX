import type { BestTimeSlot } from "@chatbotx.io/utils/post-best-times"

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const
export const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/** 0 = no posts; 1-4 = from weakest to strongest score. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4

export type HeatCell = {
  hour: number
  isTop: boolean
  level: HeatLevel
  sampleSize: number
  score: number | null
  weekday: number
}

const LEVELS = 4

const levelOf = (score: number, max: number): HeatLevel => {
  if (max <= 0) {
    return 1
  }
  const level = Math.ceil((Math.max(score, 0) / max) * LEVELS)
  return Math.min(LEVELS, Math.max(1, level)) as HeatLevel
}

/**
 * The weekday x hour grid of the best-time heatmap: 7 rows (Monday first) of 24
 * cells. A slot with no post is an empty cell (level 0, `score` null); a filled
 * one gets a level relative to the strongest slot, and `isTop` marks the ranked ones.
 */
export const buildHeatmap = (
  slots: readonly BestTimeSlot[],
  top: readonly BestTimeSlot[],
): HeatCell[][] => {
  const bySlot = new Map(
    slots.map((slot) => [`${slot.weekday}:${slot.hour}`, slot]),
  )
  const topKeys = new Set(top.map((slot) => `${slot.weekday}:${slot.hour}`))
  const max = slots.reduce((best, slot) => Math.max(best, slot.score), 0)
  return WEEKDAYS.map((weekday) =>
    HOURS.map((hour): HeatCell => {
      const key = `${weekday}:${hour}`
      const slot = bySlot.get(key)
      return slot
        ? {
            hour,
            isTop: topKeys.has(key),
            level: levelOf(slot.score, max),
            sampleSize: slot.sampleSize,
            score: slot.score,
            weekday,
          }
        : { hour, isTop: false, level: 0, sampleSize: 0, score: null, weekday }
    }),
  )
}
