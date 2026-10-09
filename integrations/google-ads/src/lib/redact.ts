export const REDACTED = "[redacted]"

// Order matters: longer, more specific shapes first.
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bya29\.[A-Za-z0-9._-]+/g,
  /\b1\/\/[A-Za-z0-9._-]{20,}/g,
  // `(?<!\.)`: a field path such as `adIdentifiers.gclid: invalid` names the
  // field, it does not carry a click id (the id itself is caught as a secret).
  /((?<!\.)"?(?:gclid|gbraid|wbraid|access_token|refresh_token|developer-token)"?\s*[:=]\s*"?)[^"\s,}&]+/gi,
  // Customer-matching data: a SHA-256 digest (hex, 64), a plain e-mail address
  // and an E.164 phone number, in case Google echoes one back in an error.
  /\b[0-9a-f]{64}\b/gi,
  // The look-behind lets a match start only at the beginning of a run, so a long
  // run of local-part characters without an `@` is scanned once, not once per
  // start position (this runs on bodies that have not been cut down yet).
  /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g,
  /(?<![\w.])\+\d{7,15}\b/g,
]

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Scrubs credentials, key material and the given exact secrets (e.g. the click ids of a request). */
export const redactSecrets = (
  text: string,
  secrets: readonly string[] = [],
): string => {
  let result = text
  for (const secret of secrets) {
    if (secret) {
      result = result.replace(new RegExp(escapeRegExp(secret), "g"), REDACTED)
    }
  }
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (_match, prefix: unknown) =>
      typeof prefix === "string" ? `${prefix}${REDACTED}` : REDACTED,
    )
  }
  return result
}
