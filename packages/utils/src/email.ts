const EMAIL_THREAD_SOURCE_PREFIX = "email:"

export const isEmailThreadSourceId = (
  sourceId: string | null | undefined,
): boolean => sourceId?.startsWith(EMAIL_THREAD_SOURCE_PREFIX) ?? false

export const generateMessageId = (domain: string): string =>
  `<${globalThis.crypto.randomUUID()}@${domain}>`

/** Stable Message-ID for an idempotent outbound email operation. */
export const deterministicMessageId = (seed: string, domain: string): string =>
  `<${encodeURIComponent(seed)}@${domain}>`

const ANGLE_ADDRESS = /<([^>]+)>\s*$/

/**
 * The bare, lowercase address of a value that may be stored as `Name <email>`.
 * Compare and derive domains from this, never from the display form.
 */
export const extractEmailAddress = (value: string): string => {
  const match = value.match(ANGLE_ADDRESS)
  return (match ? match[1] : value).trim().toLowerCase()
}

/** Domain part of a (possibly `Name <email>`) address, for Message-IDs. */
export const emailMessageIdDomain = (value: string): string =>
  extractEmailAddress(value).split("@")[1] || "localhost"
