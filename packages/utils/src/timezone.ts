/**
 * IANA renamed a number of timezones and kept the old names as links in its
 * `backward` file. Browsers still report several of the old names from
 * `Intl.DateTimeFormat().resolvedOptions().timeZone`, and those names reach us
 * verbatim as a `tz` URL param.
 *
 * That matters because the name is ultimately handed to PostgreSQL's
 * `AT TIME ZONE`, and a PostgreSQL build packaged without the `backward` tzdata
 * file rejects the old name outright:
 *
 *     ERROR: time zone "Asia/Saigon" not recognized   (SQLSTATE 22023)
 *
 * Node's own validation cannot catch this: `Intl` and PostgreSQL carry separate
 * timezone databases, and they disagree about which spelling is canonical —
 * on macOS/ICU `Intl.DateTimeFormat("en", { timeZone: "Asia/Ho_Chi_Minh" })
 * .resolvedOptions().timeZone` answers `"Asia/Saigon"`, the exact reverse of
 * IANA. So neither name can be assumed correct from the Node side; both are
 * offered to PostgreSQL, which picks the one it actually knows (see
 * `zonedDateKey` in `@chatbotx.io/database/queries`).
 *
 * Only entries a browser realistically reports are listed — this is a
 * best-effort accuracy aid, never a correctness gate: an unmapped name still
 * resolves safely (to UTC) at the SQL layer rather than failing the request.
 */
const CANONICAL_BY_LEGACY_TIMEZONE: Record<string, string> = {
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Chongqing": "Asia/Shanghai",
  "Asia/Harbin": "Asia/Shanghai",
  "Asia/Istanbul": "Europe/Istanbul",
  "Europe/Kiev": "Europe/Kyiv",
  "Europe/Uzhgorod": "Europe/Kyiv",
  "Europe/Zaporozhye": "Europe/Kyiv",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Godthab": "America/Nuuk",
  "Pacific/Ponape": "Pacific/Pohnpei",
  "Pacific/Truk": "Pacific/Chuuk",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Africa/Asmera": "Africa/Asmara",
  "Australia/Canberra": "Australia/Sydney",
  US: "America/New_York",
}

/**
 * Every spelling of `timezone` worth offering to PostgreSQL, most-preferred
 * first. Always at least the caller's own value; a second entry appears only
 * when a rename is known, in EITHER direction (the caller's value may be the
 * legacy name or the canonical one — both happen, see the module doc).
 */
export function timezoneCandidates(timezone: string): string[] {
  const canonical = CANONICAL_BY_LEGACY_TIMEZONE[timezone]
  if (canonical) {
    return [timezone, canonical]
  }
  const legacy = Object.keys(CANONICAL_BY_LEGACY_TIMEZONE).find(
    (name) => CANONICAL_BY_LEGACY_TIMEZONE[name] === timezone,
  )
  return legacy ? [timezone, legacy] : [timezone]
}
