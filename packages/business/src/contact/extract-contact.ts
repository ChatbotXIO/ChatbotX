import {
  type CountryCode,
  type NumberFormat,
  type PhoneNumber,
  parsePhoneNumberFromString,
} from "libphonenumber-js"

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/

/**
 * Region fallback list when no `defaultCountry` is supplied. Narrower than the
 * PHP `hasPhoneNumber` original (`['VN','PH','KH','ID','US','TH']`) to avoid
 * false positives from overlapping numbering plans.
 */
const FALLBACK_REGIONS: CountryCode[] = ["VN", "US"]

/** Minimum text length worth running through the extractor; shorter text (an "ok", an emoji) is skipped before any scan. */
export const MIN_EXTRACT_LENGTH = 5

/** Minimum digit count for `parsePhoneNumber` to even attempt. Matches PHP. */
const MIN_DIGITS = 8

/** Digit-run matcher — at least 8 digits, optionally interleaved with separators. */
const DIGIT_RUN_RE = /(?:[-_.+()\s]*\d){8,}/gm

/** Strip noise chars (mirrors PHP `strtr` table). */
const STRIP_CHARS_RE = /[-.,_\s()\t\n\r]/g

/** Collapse runs of `+` into a single `+`. */
const MULTI_PLUS_RE = /\++/g

/** VN-only: when match length ≥10, prefer the first run of 10 digits followed by a non-digit. */
const VN_TEN_DIGIT_RE = /(\d{10})\D/m

/** Loose common-format phone regex used as a fallback when the strict run scan misses. */
const COMMON_PHONE_RE =
  /[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}\b/gim

export type ExtractedContactInfo = {
  /** E.164 format when libphonenumber recognises the number. */
  phoneNumber?: string
  /** Trimmed, lower-cased. */
  email?: string
}

/**
 * Per-field opt-out for callers that have already discovered one side of the
 * pair (e.g. Messenger coexist sync skips libphonenumber once a conversation's
 * phone is known — the two-stage scan dominates CPU per message).
 */
export type ExtractContactOptions = {
  skipPhone?: boolean
  skipEmail?: boolean
}

/** Parsed phone carrying the cleaned source string (for E.164 vs raw decision). */
export type ParsedPhone = {
  number: PhoneNumber
  phoneFromString: string
}

const cleanPhone = (raw: string): string =>
  raw.replace(STRIP_CHARS_RE, "").replace(MULTI_PLUS_RE, "+")

/** PHP `getCommonPhoneNumber` — returns the LAST loose-format match (PHP `end()`). */
const getCommonPhoneNumber = (text: string): string | null => {
  const matches = text.match(COMMON_PHONE_RE)
  return matches?.[matches.length - 1] ?? null
}

const tryRegions = (
  text: string,
  regions: CountryCode[],
): ParsedPhone | null => {
  if (!text || text.length < MIN_DIGITS) {
    return null
  }
  const matches = text.match(DIGIT_RUN_RE)
  if (!matches || matches.length === 0) {
    return null
  }

  for (const rawMatch of matches) {
    const cleaned = cleanPhone(rawMatch)
    for (const region of regions) {
      // VN special case: when the cleaned number is ≥10 chars, prefer the
      // first 10-digit window from the raw match so trailing junk doesn't poison parsing.
      let phone = cleaned
      if (region === "VN" && cleaned.length >= 10) {
        const vn = rawMatch.match(VN_TEN_DIGIT_RE)
        phone = vn?.[1] ?? cleaned
      }

      let parsed: PhoneNumber | undefined
      try {
        parsed = parsePhoneNumberFromString(phone, region)
      } catch {
        continue
      }
      if (!parsed) {
        continue
      }
      // PHP skips FIXED_LINE for any non-VN region to suppress
      // overlapping landline false positives.
      if (parsed.getType() === "FIXED_LINE" && region !== "VN") {
        continue
      }
      if (!parsed.isPossible()) {
        continue
      }
      if (!parsed.isValid()) {
        continue
      }
      return { number: parsed, phoneFromString: phone }
    }
  }
  return null
}

/**
 * Port of PHP `parsePhoneNumber` (chatbotai `app/Helpers/functions.php`).
 *
 * Two-stage: strict digit-run scan → loose `getCommonPhoneNumber` fallback.
 * Honors caller-supplied region(s); otherwise uses `FALLBACK_REGIONS`.
 */
export const parsePhoneNumber = (
  text: string | null | undefined,
  region?: CountryCode | CountryCode[] | string | null,
): ParsedPhone | null => {
  if (!text) {
    return null
  }
  let regions: CountryCode[]
  if (Array.isArray(region)) {
    regions = region as CountryCode[]
  } else if (region) {
    regions = [region as CountryCode, ...FALLBACK_REGIONS]
  } else {
    regions = FALLBACK_REGIONS
  }

  let result = tryRegions(text, regions)
  if (!result) {
    const common = getCommonPhoneNumber(text)
    if (common) {
      result = tryRegions(common, regions)
    }
  }
  return result
}

/**
 * Port of PHP `hasPhoneNumber`. Calls `parsePhoneNumber` first, then decides
 * format:
 *  - Explicit `format` arg wins.
 *  - Else: input starts with `+` OR with the country code → format as E.164.
 *  - Else: return raw cleaned input (PHP behavior preserved).
 */
export const hasPhoneNumber = (
  text: string | null | undefined,
  region?: CountryCode | CountryCode[] | string | null,
  format: NumberFormat | null = null,
): string | null => {
  if (!text) {
    return null
  }
  const parsed = parsePhoneNumber(text, region)
  if (!parsed) {
    return null
  }
  if (format) {
    return parsed.number.format(format)
  }
  const cc = String(parsed.number.countryCallingCode)
  if (
    parsed.phoneFromString.startsWith("+") ||
    parsed.phoneFromString.startsWith(cc)
  ) {
    return parsed.number.format("E.164")
  }
  return parsed.phoneFromString
}

/**
 * Pure extractor — scans free text for phone + email. Used by Messenger
 * coexist historical sync and the live webhook to enrich Contact rows when
 * the customer typed their phone/email into a message body.
 *
 * Phone resolution: PHP `hasPhoneNumber` port forced to E.164.
 * Email: first regex match wins, lower-cased + trimmed.
 */
export const extractContactInfo = (
  text: string | null | undefined,
  defaultCountry?: string | null,
  options?: ExtractContactOptions,
): ExtractedContactInfo => {
  if (!text || text.length < MIN_EXTRACT_LENGTH) {
    return {}
  }

  const result: ExtractedContactInfo = {}

  if (!options?.skipEmail) {
    const emailMatch = text.match(EMAIL_REGEX)
    if (emailMatch) {
      result.email = emailMatch[0].trim().toLowerCase()
    }
  }

  if (!options?.skipPhone) {
    const phone = hasPhoneNumber(text, defaultCountry ?? null, "E.164")
    if (phone) {
      result.phoneNumber = phone
    }
  }

  return result
}
