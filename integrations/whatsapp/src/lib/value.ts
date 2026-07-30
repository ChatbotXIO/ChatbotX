/**
 * Narrows an untrusted webhook field to a non-empty string.
 *
 * Meta omits optional fields rather than sending them empty, but it also sends
 * `""` for some, and both mean "absent" to every caller here. Shared so the
 * referral parser and the reply readers agree on what counts as a value.
 */
export const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null
