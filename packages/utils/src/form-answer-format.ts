/**
 * A date-range form answer as text: the `{ "start-date", "end-date" }` that a
 * WhatsApp Flow `CalendarPicker` in range mode returns (Mini App date ranges
 * share the shape) becomes `start - end`. Null for any other value.
 */
export const formatDateRange = (value: unknown): string | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }
  const range = value as Record<string, unknown>
  const start = range["start-date"]
  const end = range["end-date"]
  return typeof start === "string" && typeof end === "string"
    ? `${start} - ${end}`
    : null
}
