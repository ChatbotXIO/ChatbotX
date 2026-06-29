export const META_RESPONSE_WINDOW_MS = 24 * 60 * 60 * 1000
export const META_HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export function normalizeLastIncomingMessageAt(
  value: Date | string | null | undefined,
): Date | null {
  if (!value) {
    return null
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
