import { type CountryCode, parsePhoneNumberFromString } from "libphonenumber-js"
// The default ("min") metadata only checks lengths for most countries, which cannot
// tell `4915112345678` (a DE mobile with its calling code) from a local number;
// the full metadata can.
import { parsePhoneNumberFromString as parsePhoneNumberStrict } from "libphonenumber-js/max"

const UNKNOWN_TARGET_COUNTRY = "unknown"

// No workspace country means local-format numbers must include "+".
export const resolveDefaultRegion = (
  targetCountry: string | null | undefined,
): CountryCode | undefined =>
  targetCountry && targetCountry !== UNKNOWN_TARGET_COUNTRY
    ? (targetCountry as CountryCode)
    : undefined

/**
 * The E.164 form (`+84901234567`) of a phone number, or `null` when it cannot be
 * parsed. Deliberately not `isValid()`: that rejects well-formed but unassigned
 * numbers, which are still real contact identities.
 */
export const normalizePhoneToE164 = (
  rawPhone: string,
  targetCountry: string | null | undefined,
): string | null =>
  parsePhoneNumberFromString(rawPhone, resolveDefaultRegion(targetCountry))
    ?.number ?? null

const MOBILE_TYPES: ReadonlySet<string | undefined> = new Set([
  "MOBILE",
  "FIXED_LINE_OR_MOBILE",
])

/**
 * A WhatsApp `wa_id` written in the workspace's own country: bare digits that
 * start with the calling code (`4915112345678` in DE). Only a real mobile in
 * that country counts — plenty of local numbers (VN `846366595`, BR
 * `55991234567`, IN `9118772020`) merely *look* like `+<calling code>…` with
 * the lenient metadata, and must keep their national reading.
 */
const parseOwnCountryWaId = (
  rawPhone: string,
  region: CountryCode | undefined,
): string | null => {
  if (!region || rawPhone.startsWith("+")) {
    return null
  }
  const parsed = parsePhoneNumberStrict(`+${rawPhone}`)
  return parsed?.isValid() &&
    parsed.country === region &&
    MOBILE_TYPES.has(parsed.getType())
    ? parsed.number
    : null
}

/**
 * The E.164 form of a phone read from a webhook payload, where a WhatsApp
 * `wa_id` arrives as bare digits that the workspace country could otherwise
 * misread as a national number. In order:
 * 1. a same-country mobile `wa_id` (see `parseOwnCountryWaId`);
 * 2. a valid national number in the workspace country;
 * 3. the digits as an international number, when valid (a foreign `wa_id`);
 * 4. the lenient parse of `normalizePhoneToE164`.
 */
export const normalizeIdentityPhoneToE164 = (
  rawPhone: string,
  targetCountry: string | null | undefined,
): string | null => {
  const region = resolveDefaultRegion(targetCountry)
  const ownCountryWaId = parseOwnCountryWaId(rawPhone, region)
  if (ownCountryWaId) {
    return ownCountryWaId
  }
  const national = parsePhoneNumberFromString(rawPhone, region)
  if (national?.isValid()) {
    return national.number
  }
  const international = rawPhone.startsWith("+")
    ? undefined
    : parsePhoneNumberFromString(`+${rawPhone}`)
  if (international?.isValid()) {
    return international.number
  }
  return national?.number ?? null
}
