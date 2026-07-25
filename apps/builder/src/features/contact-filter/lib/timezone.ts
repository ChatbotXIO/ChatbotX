/**
 * The browser's current IANA timezone (e.g. `"Asia/Ho_Chi_Minh"`).
 *
 * Contact-filter date/datetime values are entered as naive wall-clock strings.
 * This zone is stamped onto the filter criteria so the backend can interpret
 * those values in the user's local time (see the `timezone` field on
 * `contactFilterCriteriaSchema`). Falls back to `"UTC"` if the runtime cannot
 * resolve a zone.
 */
export const getBrowserTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}
