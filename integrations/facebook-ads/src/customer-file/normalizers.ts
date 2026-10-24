import { normalizePhoneNumber } from "../apis/audience-users"

// Hoisted: Biome's useTopLevelRegex forbids regex literals inside functions.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NON_LETTER_OR_SPACE = /[^\p{L}\s]/gu
const NON_LETTER = /[^\p{L}]/gu
const WHITESPACE_RUN = /\s+/g
const WHITESPACE = /\s/g
const COUNTRY_PATTERN = /^[a-z]{2}$/
const US_ZIP_PREFIX = /^\d{5}/
const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
const US_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/
const FOUR_DIGITS = /^\d{4}$/
const MIN_BIRTH_YEAR = 1900

const orNull = (value: string): string | null => (value ? value : null)

export function normalizeEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  return EMAIL_PATTERN.test(value) ? value : null
}

/**
 * Prefers a libphonenumber parse with the row's country (via the existing
 * `normalizePhoneNumber`), which also handles international `+` numbers with
 * no country. A local number (leading 0) with no country returns null rather
 * than hashing a guessed identity.
 */
export function normalizeCustomerPhone(
  raw: string,
  country: string | null,
): string | null {
  const value = raw.trim()
  if (!value) {
    return null
  }
  return normalizePhoneNumber(value, country ? country.toUpperCase() : null)
}

export function normalizeName(raw: string): string | null {
  return orNull(
    raw
      .normalize("NFC")
      .toLowerCase()
      .replace(NON_LETTER_OR_SPACE, "")
      .replace(WHITESPACE_RUN, " ")
      .trim(),
  )
}

export function normalizeCity(raw: string): string | null {
  return orNull((normalizeName(raw) ?? "").replace(WHITESPACE, ""))
}

export function normalizeState(raw: string): string | null {
  return orNull(raw.normalize("NFC").toLowerCase().replace(NON_LETTER, ""))
}

export function normalizeZip(
  raw: string,
  country: string | null,
): string | null {
  const value = raw.toLowerCase().replace(WHITESPACE, "")
  if (country === "us") {
    return US_ZIP_PREFIX.exec(value)?.[0] ?? null
  }
  return orNull(value)
}

export function normalizeCountry(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  return COUNTRY_PATTERN.test(value) ? value : null
}

const pad2 = (value: number) => String(value).padStart(2, "0")

function toDob(
  year: number,
  month: number,
  day: number,
  now: Date,
): { doby: string; dobm: string; dobd: string } | null {
  if (year < MIN_BIRTH_YEAR || year > now.getUTCFullYear()) {
    return null
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return { doby: String(year), dobm: pad2(month), dobd: pad2(day) }
}

/**
 * Accepts `YYYY-MM-DD`, `MM/DD/YYYY`, `MM/DD/YY`. A 2-digit year greater than
 * the current 2-digit year is 19xx, otherwise 20xx (spec D22).
 */
export function parseDateOfBirth(
  raw: string,
  now: Date = new Date(),
): { doby: string; dobm: string; dobd: string } | null {
  const value = raw.trim()
  const iso = ISO_DATE.exec(value)
  if (iso) {
    return toDob(Number(iso[1]), Number(iso[2]), Number(iso[3]), now)
  }
  const us = US_DATE.exec(value)
  if (!us) {
    return null
  }
  const yearText = us[3] ?? ""
  let year = Number(yearText)
  if (yearText.length === 2) {
    year += year > now.getUTCFullYear() % 100 ? 1900 : 2000
  }
  return toDob(year, Number(us[1]), Number(us[2]), now)
}

export function normalizeBirthYear(
  raw: string,
  now: Date = new Date(),
): string | null {
  const value = raw.trim()
  if (!FOUR_DIGITS.test(value)) {
    return null
  }
  const year = Number(value)
  return year >= MIN_BIRTH_YEAR && year <= now.getUTCFullYear() ? value : null
}

export function normalizeGender(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  if (value === "m" || value === "male") {
    return "m"
  }
  if (value === "f" || value === "female") {
    return "f"
  }
  return null
}

export function normalizeMadid(raw: string): string | null {
  return orNull(raw.trim().toLowerCase())
}
