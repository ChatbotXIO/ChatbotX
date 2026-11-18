const EMAIL_THREAD_SOURCE_PREFIX = "email:"

export const isEmailThreadSourceId = (
  sourceId: string | null | undefined,
): boolean => sourceId?.startsWith(EMAIL_THREAD_SOURCE_PREFIX) ?? false

export const generateMessageId = (domain: string): string =>
  `<${globalThis.crypto.randomUUID()}@${domain}>`

/** Stable Message-ID for an idempotent outbound email operation. */
export const deterministicMessageId = (seed: string, domain: string): string =>
  `<${encodeURIComponent(seed)}@${domain}>`
