import { GOOGLE_CLICK_REFERRAL_KEYS } from "@chatbotx.io/utils/google-click"
import { type SQL, sql } from "drizzle-orm"
import { contactInboxModel } from "../schema"

// LEAF module (same constraint as `ad-referral.ts`): table references are read
// inside functions so suites that mock the schema narrowly can still import it.

/**
 * A Google Ads Click-to-Message click is recorded on the contact inbox
 * (`gclid` or, for iOS, `gbraid`). Deliberately NOT part of the Meta
 * `adConversationPredicate` family, which drives the Meta funnel.
 */
export const googleClickPredicate = (): SQL =>
  sql`(${contactInboxModel.referral}->>'gclid' IS NOT NULL OR ${contactInboxModel.referral}->>'gbraid' IS NOT NULL)`

const GOOGLE_CLICK_KEYS: ReadonlySet<string> = new Set(
  GOOGLE_CLICK_REFERRAL_KEYS,
)

/**
 * The only writer (`toGoogleClickReferral`) stores `Date#toISOString()`, a
 * fixed-width `YYYY-MM-DDTHH:MM:SS.sssZ`, so lexicographic order equals
 * chronological order and the values can be compared as plain text.
 */
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** The same shape as `ISO_TIMESTAMP_PATTERN`, spelled for Postgres POSIX regex. */
const ISO_TIMESTAMP_SQL_PATTERN =
  "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$"

/**
 * Atomic newest-click-wins merge of `nextReferral` into `ContactInbox.referral`.
 *
 * Returns `null` when the incoming `googleClickReceivedAt` is not exactly the
 * fixed-width ISO shape above, so the caller keeps its plain `||` merge and
 * non-Google behaviour is untouched. Otherwise the value is a single
 * expression evaluated inside the UPDATE (no read-modify-write): when the
 * stored `googleClickReceivedAt` matches the same strict shape and is strictly
 * newer, the six Google keys of the incoming referral are dropped and only the
 * remaining keys merge; when it is equal, older, absent or not of that shape,
 * the whole incoming referral applies (including the explicit nulls that clear
 * the other click id).
 *
 * The comparison is TEXT, never a `timestamptz` cast, so no stored value can
 * make the UPDATE throw and it needs no particular Postgres version. A stored
 * value that has the right shape but is not a real date (for example
 * `2026-99-99T00:00:00.000Z`) passes the regex and compares as text; that is
 * harmless: nothing but `toISOString()` writes the key, so it cannot occur in
 * practice, and if it did it would merely sort by its characters. `COLLATE "C"`
 * pins byte-order comparison independent of the database locale.
 */
export const newestGoogleClickReferralMerge = (
  nextReferral: Record<string, unknown>,
): SQL | null => {
  const receivedAt = nextReferral.googleClickReceivedAt
  if (
    typeof receivedAt !== "string" ||
    !ISO_TIMESTAMP_PATTERN.test(receivedAt)
  ) {
    return null
  }
  const withoutGoogleKeys = Object.fromEntries(
    Object.entries(nextReferral).filter(([key]) => !GOOGLE_CLICK_KEYS.has(key)),
  )
  const referral = contactInboxModel.referral
  const stored = sql`(${referral}->>'googleClickReceivedAt')`
  return sql`COALESCE(${referral}, '{}'::jsonb) || CASE WHEN CASE WHEN ${stored} ~ ${ISO_TIMESTAMP_SQL_PATTERN} THEN ${stored} COLLATE "C" > ${receivedAt}::text COLLATE "C" ELSE false END THEN ${JSON.stringify(withoutGoogleKeys)}::jsonb ELSE ${JSON.stringify(nextReferral)}::jsonb END`
}
