/**
 * Formats a whole-second call duration as `m:ss` (no hour component — calls never run that
 * long). Mirrors the worker's own `formatDuration` (`whatsapp-call-finalize.ts`) so the format
 * can't drift between them.
 */
export const formatCallDurationSeconds = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00"
  }
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}:${String(remainder).padStart(2, "0")}`
}
