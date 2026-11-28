const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 60 * 60

const pad2 = (value: number): string => String(value).padStart(2, "0")

/**
 * Formats a remaining duration as hh:mm:ss (hours may exceed 24).
 *
 * The messaging-window policy and state live in `@chatbotx.io/sdk`
 * (`resolveMessagingWindow`), the single source for the server's send gate,
 * the API, the composer and the contact panel row. Only display formatting
 * is builder-specific.
 */
export const formatCountdown = (remainingMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / MS_PER_SECOND))
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR)
  const minutes = Math.floor(
    (totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE,
  )
  const seconds = totalSeconds % SECONDS_PER_MINUTE
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`
}
