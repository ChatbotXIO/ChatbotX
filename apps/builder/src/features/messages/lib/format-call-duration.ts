/**
 * Formats a whole-second call duration as `m:ss` (no hour component — calls
 * never run that long). Shared so the audio player's elapsed/total timer and
 * the inbox last-message preview (`resolveLastMessagePreview`) can never
 * drift on the format — mirrors the worker's own `formatDuration`
 * (`whatsapp-call-finalize.ts`), which builds the English fallback snippet
 * stored on the message row.
 */
export const formatCallDurationSeconds = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00"
  }
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}:${String(remainder).padStart(2, "0")}`
}
