// Generic, reusable log-safety helpers: redact secrets by key name and cap
// oversized text. Use these anywhere in the system that dumps data for
// debugging (webhook bodies, AI payloads, integration responses, …) so a
// diagnostic line can never leak a secret or flood the log with a giant line.
// No domain- or channel-specific knowledge lives here — extend SENSITIVE_KEYS
// once and every caller benefits.

export const DEFAULT_MAX_LOG_CHARS = 16_000

// Bounds recursion so a hostile or pathological deeply nested value cannot
// overflow the call stack; the subtree beyond it is dropped, never leaked raw.
const MAX_REDACT_DEPTH = 64

// Redact by sensitive KEY NAME (exact, case-insensitive).
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  "access_token",
  "refresh_token",
  "auth_token",
  "id_token",
  "verify_token",
  "token",
  "client_secret",
  "app_secret",
  "secret",
  "secret_key",
  "private_key",
  "password",
  "signature",
  "api_key",
  "apikey",
  "authorization",
  "sdp",
])

// Sensitive query-string params whose VALUE must be scrubbed even when embedded
// inside a URL string (e.g. a Graph request URL captured on an HTTP error),
// where the key-name redaction below cannot see it. Matches `?token=` / `&token=`
// up to the next delimiter, case-insensitively.
const SENSITIVE_QUERY_PARAMS = [
  "access_token",
  "refresh_token",
  "fb_exchange_token",
  "auth_token",
  "id_token",
  "client_secret",
  "app_secret",
  "signature",
  "api_key",
  "apikey",
  "key",
]
const SENSITIVE_QUERY_RE = new RegExp(
  `([?&](?:${SENSITIVE_QUERY_PARAMS.join("|")})=)[^&#\\s"']+`,
  "gi",
)

/** Redact the value of any sensitive query param embedded in a string. */
export const scrubSecretsInString = (value: string): string =>
  value.replace(SENSITIVE_QUERY_RE, "$1[redacted]")

// Primitives never recurse, so the depth guard applies only to arrays/objects.
const redactAtDepth = (value: unknown, depth: number): unknown => {
  if (typeof value === "string") {
    return scrubSecretsInString(value)
  }
  if (value === null || typeof value !== "object") {
    return value
  }
  if (depth >= MAX_REDACT_DEPTH) {
    return "[omitted: too deeply nested]"
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactAtDepth(item, depth + 1))
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) =>
      SENSITIVE_KEYS.has(key.toLowerCase())
        ? [key, "[redacted]"]
        : [key, redactAtDepth(item, depth + 1)],
    ),
  )
}

/**
 * Recursively replace the value of any sensitive-named key with "[redacted]",
 * returning a NEW structure (never mutates the input). Works on any JSON-like
 * value; primitives pass through untouched; recursion is depth-bounded so a
 * deeply nested value cannot overflow the stack.
 */
export const redactSecrets = (value: unknown): unknown =>
  redactAtDepth(value, 0)

/**
 * Turn any thrown value into a log-safe shape: `name` + a secret-scrubbed
 * `message` and `stack`. It deliberately drops nested `request`/`response`/
 * `originError` fields (an HTTP client error carries the request URL there,
 * which for Graph calls includes `access_token` in the query string) rather
 * than trusting a recursive walk to reach every getter. Use it whenever an
 * integration/HTTP error is logged, so a credential can never reach the logs.
 * The underlying channel error code/status is already recorded, sanitized, at
 * the HTTP-client layer.
 */
export const toLogSafeError = (
  err: unknown,
): { message: string; name: string; stack?: string } => {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: scrubSecretsInString(err.message),
      ...(err.stack ? { stack: scrubSecretsInString(err.stack) } : {}),
    }
  }
  return { name: "NonError", message: scrubSecretsInString(String(err)) }
}

/**
 * Cap a string to `maxChars`, appending a truncation marker, without splitting
 * a trailing UTF-16 surrogate pair (log payloads are often emoji-heavy).
 */
export const capText = (
  text: string,
  maxChars: number = DEFAULT_MAX_LOG_CHARS,
): string => {
  if (text.length <= maxChars) {
    return text
  }
  const lastCharCode = text.charCodeAt(maxChars - 1)
  const endsOnHighSurrogate = lastCharCode >= 0xd8_00 && lastCharCode <= 0xdb_ff
  const end = endsOnHighSurrogate ? maxChars - 1 : maxChars
  return `${text.slice(0, end)}…[truncated ${text.length - end} chars]`
}
