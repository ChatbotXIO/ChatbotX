/**
 * Cookie carrying the browser's IANA timezone (e.g. `"Asia/Ho_Chi_Minh"`).
 *
 * Written once by `TimezoneSync` on the client; read on the server by
 * `getUserTimezone` so that next-intl formatting and timezone-sensitive
 * queries (calendar day boundaries) run in the user's zone instead of the
 * server process zone (UTC in production). Client-safe: no `next/headers`.
 */
export const TIMEZONE_COOKIE_NAME = "NEXT_TIMEZONE"
export const TIMEZONE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365
