import { sha256Hex } from "@chatbotx.io/utils/crypto"
import type { HashedCapiUserData } from "@chatbotx.io/utils/meta-capi"
import { parsePhoneNumber } from "libphonenumber-js"

/**
 * Contact→hash mapper for Meta Conversions API customer-information matching
 * (`em`/`ph`/`fn`/`ln`/`external_id` — plan feature #1).
 *
 * NORMALIZATION SOURCE (verified from source, not assumed): the currently
 * resolved `facebook-nodejs-business-sdk@26.0.0` does not hash PII itself —
 * it delegates to its `capi-param-builder-nodejs@^1.3.1` dependency
 * (resolved 1.3.1, https://github.com/facebook/capi-param-builder,
 * `nodejs/capi-param-builder/src/piiUtil/`). The rules below are copied
 * VERBATIM from that library's `emailUtil.js`/`stringUtil.js`/`phoneUtil.js`
 * and cross-checked against Meta's own published test vectors (Customer
 * Information Parameters doc) and the library's own Jest fixtures
 * (`tests/nameUtil.test.js`):
 *   - em: lowercase, trim, then validated against the SDK's RFC-2822-ish
 *     email regex — an invalid address is OMITTED, not sent malformed (no
 *     gmail dot/plus canonicalization — the SDK doesn't do that either).
 *   - fn/ln: lowercase, then STRIP EVERY whitespace and punctuation
 *     character (not just leading/trailing) — e.g. "Mary Jane" -> "maryjane",
 *     "Smith-Jones" -> "smithjones", "O'Brien" -> "obrien". This is stricter
 *     than a plain trim; verified against the SDK's own test fixtures.
 *   - ph: SHA-256 of the canonical E.164 digits (no leading "+"), included
 *     ONLY when `libphonenumber-js`'s `parsePhoneNumber` resolves an
 *     `.isValid()` number — never a best-effort/heuristic parse. A wrong
 *     phone hash can COLLIDE with a different real value, not merely fail to
 *     match, so this never falls back to a loose parse.
 *   - external_id: SHA-256 of the OPAQUE `contact.id`, NOT normalized —
 *     approved plan Decision #2. (The SDK's own `getNormalizedExternalID`
 *     would lowercase + strip whitespace, but ChatbotX ids carry no
 *     whitespace/casing noise, so this is a deliberate, documented
 *     simplification of an already-a-no-op step, not a normalization gap.)
 * Every field is UTF-8 encoded before SHA-256, hex-encoded lowercase, then
 * wrapped in a single-element array (`["<hash>"]`) per Meta's spec.
 *
 * NEVER logs or throws with the raw contact fields that feed this.
 */

export type HashableContact = {
  id: string
  email?: string | null
  phoneNumber?: string | null
  firstName?: string | null
  lastName?: string | null
}

// Verbatim from capi-param-builder's emailUtil.js (`EMAIL_RE`) — a good
// approximation of RFC 2822.
const EMAIL_RE =
  /^[\w!#$%&'*+/=?^`{|}~-]+(:?\.[\w!#$%&'*+/=?^`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i

// Verbatim from capi-param-builder's stringUtil.js
// (`STRIP_WHITESPACE_AND_PUNCTUATION_REGEX`).
const STRIP_WHITESPACE_AND_PUNCTUATION_RE =
  /[!"#$%&'()*+,\-./:;<=>?@ [\\\]^_`{|}~\s]+/g

// E.164 has exactly one leading "+"; Meta's normalized phone digits omit it.
const LEADING_PLUS_RE = /^\+/

function normalizedEmail(email: string): string | null {
  const normalized = email.trim().toLowerCase()
  return EMAIL_RE.test(normalized) ? normalized : null
}

function normalizedName(name: string): string | null {
  const normalized = name
    .replace(STRIP_WHITESPACE_AND_PUNCTUATION_RE, "")
    .toLowerCase()
  return normalized.length > 0 ? normalized : null
}

function e164DigitsIfValid(phoneNumber: string): string | null {
  let parsed: ReturnType<typeof parsePhoneNumber> | undefined
  try {
    parsed = parsePhoneNumber(phoneNumber)
  } catch {
    return null
  }
  if (!parsed?.isValid()) {
    return null
  }
  return parsed.number.replace(LEADING_PLUS_RE, "")
}

export async function hashContactUserData(
  contact: HashableContact,
): Promise<HashedCapiUserData> {
  const result: HashedCapiUserData = {}

  if (contact.email) {
    const normalized = normalizedEmail(contact.email)
    if (normalized) {
      result.em = [await sha256Hex(normalized)]
    }
  }

  if (contact.firstName) {
    const normalized = normalizedName(contact.firstName)
    if (normalized) {
      result.fn = [await sha256Hex(normalized)]
    }
  }

  if (contact.lastName) {
    const normalized = normalizedName(contact.lastName)
    if (normalized) {
      result.ln = [await sha256Hex(normalized)]
    }
  }

  if (contact.phoneNumber) {
    const digits = e164DigitsIfValid(contact.phoneNumber)
    if (digits) {
      result.ph = [await sha256Hex(digits)]
    }
  }

  result.external_id = [await sha256Hex(contact.id)]

  return result
}
