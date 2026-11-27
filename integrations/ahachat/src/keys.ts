import {
  AHACHAT_API_KEY_ENV,
  AHACHAT_DEFAULT_EXPORT_KEY_ID,
  AHACHAT_HASH_KEY_ENV,
  AHACHAT_KEY_ID_ENV,
  AHACHAT_MIN_SECRET_BYTES,
} from "./constants"
import { AhachatApiError } from "./error"

/**
 * The key pair v2 signs with: the API key is sent and identifies v2, the hash
 * key signs every request and never leaves the two servers.
 */
export type AhachatExportKey = {
  id: string
  apiKey: string
  hashKey: string
}

const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

const notConfigured = () =>
  new AhachatApiError({ code: "notConfigured", statusCode: 503 })

/** Strict base64 of at least `AHACHAT_MIN_SECRET_BYTES` bytes. */
const isStrongSecret = (value: string | undefined): value is string => {
  if (!(value && BASE64_PATTERN.test(value))) {
    return false
  }
  try {
    return atob(value).length >= AHACHAT_MIN_SECRET_BYTES
  } catch {
    return false
  }
}

/**
 * The key pair from the three env values. A missing or malformed value is
 * "not configured": the sync is off, never half-working.
 */
export const resolveAhachatExportKey = (): AhachatExportKey => {
  const apiKey = process.env[AHACHAT_API_KEY_ENV]?.trim()
  const hashKey = process.env[AHACHAT_HASH_KEY_ENV]?.trim()
  const id =
    process.env[AHACHAT_KEY_ID_ENV]?.trim() || AHACHAT_DEFAULT_EXPORT_KEY_ID
  if (
    !(
      KEY_ID_PATTERN.test(id) &&
      isStrongSecret(apiKey) &&
      isStrongSecret(hashKey)
    ) ||
    apiKey === hashKey
  ) {
    throw notConfigured()
  }
  return { id, apiKey, hashKey }
}
