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

export function formatSelectionLabel(date: Date, mode: "date" | "datetime") {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: mode === "datetime" ? "short" : undefined,
  }).format(date)
}
