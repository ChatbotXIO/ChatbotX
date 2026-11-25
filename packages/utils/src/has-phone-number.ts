/**
 * A run of at least eight digits, spaces, dashes, dots or brackets that starts
 * on a digit, optionally after a `+`. Deliberately loose: it flags a comment
 * that looks like it carries a phone number without validating it for a region,
 * so a long date or a dot-grouped price (`2026-11-22`, `1.500.000`) matches too.
 * It is the rule Comment Automation's "has a phone number" hide switch has always
 * used; tightening it changes that behaviour, so it is a deliberate decision.
 */
const PHONE_NUMBER_PATTERN = /\+?\d[\d\s\-().]{7,}/

/**
 * Whether `text` looks like it contains a phone number. The single definition
 * shared by comment hiding, the per-post phone count and the phone filters, so
 * the numbers they show always agree.
 */
export const hasPhoneNumber = (text: string): boolean =>
  PHONE_NUMBER_PATTERN.test(text)

/**
 * The same rule as a PostgreSQL POSIX pattern (`text ~ pattern`), so a list can
 * filter comments that carry a phone number in the database. `\s` is spelled
 * `[:space:]` and the optional leading `+` is dropped (it never changes whether
 * a match exists); a pinned database test keeps it equal to
 * {@link hasPhoneNumber} on a table of samples.
 */
export const PHONE_NUMBER_SQL_PATTERN = "[0-9][0-9[:space:]().-]{7,}"

/**
 * The same rule as {@link redactPhoneNumbers} spells it for PostgreSQL's
 * `regexp_replace(text, pattern, '•••', 'g')`: with the optional leading `+`,
 * so a comment is searched as the viewer sees it, numbers masked. (The SQL mask
 * also takes the space after a number, which the JavaScript one gives back.)
 */
export const PHONE_NUMBER_REDACTION_SQL_PATTERN =
  "\\+?[0-9][0-9[:space:]().-]{7,}"

const TRAILING_SPACE_PATTERN = /\s+$/
const PHONE_NUMBER_GLOBAL_PATTERN = new RegExp(PHONE_NUMBER_PATTERN.source, "g")

/** What replaces a phone number in text shown to someone who may not see phone numbers. */
export const REDACTED_PHONE_NUMBER = "•••"

/**
 * `text` with every run {@link hasPhoneNumber} flags replaced by
 * {@link REDACTED_PHONE_NUMBER}, for callers without the permission to view
 * contact phone numbers (a comment that carries one would otherwise leak it).
 */
export const redactPhoneNumbers = (text: string): string =>
  text.replace(
    PHONE_NUMBER_GLOBAL_PATTERN,
    // The rule's character class includes spaces, so a match swallows the space
    // after the number; give it back so the words around it stay apart.
    (match) =>
      `${REDACTED_PHONE_NUMBER}${TRAILING_SPACE_PATTERN.exec(match)?.[0] ?? ""}`,
  )

/**
 * The first run {@link hasPhoneNumber} flags in `text`, trimmed, or `null`. The
 * phone export lists what the customer wrote, not a validated number.
 */
export const findPhoneNumber = (text: string): string | null =>
  PHONE_NUMBER_PATTERN.exec(text)?.[0].trim() ?? null
