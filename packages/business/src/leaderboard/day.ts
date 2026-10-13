const RESET_TIME_PATTERN = /^(\d{2}):(\d{2})$/
const DAY_MS = 24 * 60 * 60 * 1000

const resetOffsetMs = (resetTime: string): number => {
  const match = RESET_TIME_PATTERN.exec(resetTime)
  if (!match) {
    return 0
  }
  return (Number(match[1]) * 60 + Number(match[2])) * 60 * 1000
}

/**
 * Start of the leaderboard-local "day" containing `now`: the latest instant at
 * or before `now` whose UTC time equals `resetTime` ("HH:mm"). Daily rule
 * counters restart at this instant.
 */
export function leaderboardDayStart(now: Date, resetTime: string): Date {
  const offset = resetOffsetMs(resetTime)
  const shifted = now.getTime() - offset
  const dayIndex = Math.floor(shifted / DAY_MS)
  return new Date(dayIndex * DAY_MS + offset)
}

/**
 * Stable key ("YYYY-MM-DD") of the leaderboard-local day containing `now`,
 * stored as `LeaderboardParticipant.dailyBucket`.
 */
export function leaderboardDayKey(now: Date, resetTime: string): string {
  const shifted = now.getTime() - resetOffsetMs(resetTime)
  return new Date(shifted).toISOString().slice(0, 10)
}
