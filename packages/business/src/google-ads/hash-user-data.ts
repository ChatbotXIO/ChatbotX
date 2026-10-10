import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { parsePhoneNumber } from "libphonenumber-js"

/**
 * Normalises and hashes customer identifiers for the Google Data Manager
 * `userData` field, following Google's formatting rules
 * (https://developers.google.com/data-manager/api/devguides/concepts/formatting):
 *   - e-mail: lowercase, no whitespace; for gmail.com / googlemail.com the dots
 *     and any `+suffix` of the local part are removed (other domains keep them);
 *   - phone: E.164 INCLUDING the leading `+`;
 *   - SHA-256 of the UTF-8 text, hex encoded.
 * Not the Meta normaliser: Meta drops the `+` from phones and does no Gmail
 * canonicalisation, so the two must not share rules.
 *
 * A value that cannot be normalised is omitted (never sent malformed, never
 * guessed): a wrong hash can collide with another person's identifier.
 * NEVER logs or throws with the raw value.
 */

export type MatchingValues = {
  email?: string | null
  phone?: string | null
}

/** Hex SHA-256 digests, as `userData.userIdentifiers` carries them with `encoding: "HEX"`. */
export type HashedMatchingIdentifiers = {
  emailAddress?: string
  phoneNumber?: string
}

const GMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
])
const WHITESPACE = /\s+/g
const LOCAL_DOTS = /\./g
const PLAIN_ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const normalizeEmail = (raw: string): string | null => {
  const lowered = raw.replace(WHITESPACE, "").toLowerCase()
  const parts = lowered.split("@")
  if (parts.length !== 2) {
    return null
  }
  const [local, domain] = parts
  const canonicalLocal = GMAIL_DOMAINS.has(domain ?? "")
    ? (local ?? "").replace(LOCAL_DOTS, "").split("+")[0]
    : local
  if (!(canonicalLocal && domain)) {
    return null
  }
  const address = `${canonicalLocal}@${domain}`
  return PLAIN_ADDRESS.test(address) ? address : null
}

/**
 * Digits only, no leading zero: how a WhatsApp `wa_id` is stored (the full
 * international number without its `+`). A leading zero is a national trunk
 * prefix, so such a number is not read as international.
 */
const INTERNATIONAL_DIGITS = /^[1-9]\d{7,14}$/

const parseE164 = (text: string): string | null => {
  try {
    const parsed = parsePhoneNumber(text, { extract: false })
    return parsed.isValid() && !parsed.ext ? parsed.number : null
  } catch {
    return null
  }
}

/**
 * E.164 with the `+`, only for a number that `libphonenumber-js` validates.
 * A national number is never guessed from any locale; the one tolerated shape
 * without a `+` is the international digit string above. An extension is not
 * part of an identifier.
 */
export const normalizePhone = (raw: string): string | null => {
  const text = raw.trim()
  return (
    parseE164(text) ??
    (INTERNATIONAL_DIGITS.test(text) ? parseE164(`+${text}`) : null)
  )
}

export const hashMatchingIdentifiers = async (
  values: MatchingValues,
): Promise<HashedMatchingIdentifiers> => {
  const email = values.email ? normalizeEmail(values.email) : null
  const phone = values.phone ? normalizePhone(values.phone) : null
  return {
    ...(email ? { emailAddress: await sha256Hex(email) } : {}),
    ...(phone ? { phoneNumber: await sha256Hex(phone) } : {}),
  }
}
