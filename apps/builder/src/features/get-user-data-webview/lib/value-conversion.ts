/**
 * "date" mode always converts to UTC midnight of the picked calendar day,
 * matching the typed-reply `asIsoDate` validator, which parses a bare
 * "YYYY-MM-DD" string as UTC midnight. Converting to local midnight instead
 * would shift the stored day backward for contacts east of UTC (e.g. GMT+7).
 * "datetime" mode keeps the contact's local picked instant as-is.
 *
 * Deliberately dependency-free (no imports from the webview action/queue
 * chain) so it can be unit tested in isolation without pulling in
 * server-only packages.
 */
export function toSelectedValueIso(
  date: Date | undefined,
  mode: "date" | "datetime",
): string | null {
  if (!date) {
    return null
  }

  if (mode === "date") {
    return new Date(
      Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
    ).toISOString()
  }

  return date.toISOString()
}

/**
 * Chatrace-style submit-bar label: "21 AUG 2026" / "21 AUG 2026 00:07",
 * locale-aware (month name and ordering follow the workspace locale).
 */
export function formatSelectionLabel(
  date: Date,
  mode: "date" | "datetime",
  locale?: string,
): string {
  const dayPart = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)

  if (mode !== "datetime") {
    return dayPart.toLocaleUpperCase(locale)
  }

  const timePart = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)

  return `${dayPart} ${timePart}`.toLocaleUpperCase(locale)
}
