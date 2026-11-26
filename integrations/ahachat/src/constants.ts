/**
 * Operator-set base URL of the AhaChat contact export API, path included; requests
 * append the resource name (`pages`, `users`, …). Never user input. Unset, the
 * AhaChat sync is off and hidden.
 */
export const AHACHAT_API_BASE_URL_ENV = "AHACHAT_API_BASE_URL"

/**
 * The API key sent to identify this deployment to AhaChat (base64 of at
 * least 32 random bytes). Server env only, never shipped to a client.
 */
export const AHACHAT_API_KEY_ENV = "AHACHAT_API_KEY"

/**
 * The hash (HMAC) key v2 signs every request with: shared with the AhaChat
 * servers and never sent. Base64 of at least 32 random bytes, different from
 * the API key.
 */
export const AHACHAT_HASH_KEY_ENV = "AHACHAT_HASH_KEY"

/** Names this pair in `X-Aha-Key-Id` so the servers can rotate it (default `k1`). */
export const AHACHAT_KEY_ID_ENV = "AHACHAT_KEY_ID"
export const AHACHAT_DEFAULT_EXPORT_KEY_ID = "k1"

/** Each secret is at least this many random bytes, base64 encoded. */
export const AHACHAT_MIN_SECRET_BYTES = 32

/** Version tag, audience and purpose of the canonical string (the wire contract with AhaChat). */
export const AHACHAT_SIGNATURE_VERSION = "AHACHAT-EXPORT-HMAC-V1"
export const AHACHAT_SIGNATURE_AUDIENCE = "ahachat-v1"
export const AHACHAT_SIGNATURE_PURPOSE = "contact-export"

/** One deadline for a whole call: connect, headers and reading the body. */
export const AHACHAT_HTTP_TIMEOUT_MS = 20_000

/** Most pages one discovery request may ask about. */
export const AHACHAT_MAX_DISCOVERY_PAGES = 100

/** The most contacts AhaChat returns in one page. */
export const AHACHAT_MAX_CONTACTS_PAGE_SIZE = 500

export const AHACHAT_DEFAULT_CONTACTS_PAGE_SIZE = 200

/** Largest response body read; a bigger one is refused before parsing. */
export const AHACHAT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024

/** Most tags / custom fields a page or one contact may list. */
export const AHACHAT_MAX_LIST_ITEMS = 5000

/** Same limit as tag and custom-field names in the workspace. */
export const AHACHAT_MAX_NAME_LENGTH = 255

/** Longest free-text value kept from a contact (ref, address parts, locale…). */
export const AHACHAT_MAX_TEXT_LENGTH = 4096
