export type EmailThreadAttributes = {
  subject?: string
  messageId?: string
  inReplyTo?: string
  references?: string[]
}

const DEFAULT_SUBJECT = "New message"
const REPLY_PREFIX = /^\s*(re|fwd?)\s*:/i
const MAX_REFERENCES = 20
const PARAGRAPH_BREAK = /\n{2,}/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : undefined

/**
 * Reads the thread headers a message carries under
 * `contentAttributes.email` (written by the inbound path). Untrusted shape.
 */
export const readThreadAttributes = (
  contentAttributes: { [x: string]: unknown } | null | undefined,
): EmailThreadAttributes => {
  const email = contentAttributes?.email
  if (!isRecord(email)) {
    return {}
  }
  const references = Array.isArray(email.references)
    ? email.references.filter(
        (item): item is string => typeof item === "string" && item !== "",
      )
    : undefined
  return {
    subject: asString(email.subject),
    messageId: asString(email.messageId),
    inReplyTo: asString(email.inReplyTo),
    references,
  }
}

export const buildReplySubject = (subject: string | undefined): string => {
  if (!subject) {
    return DEFAULT_SUBJECT
  }
  return REPLY_PREFIX.test(subject) ? subject : `Re: ${subject}`
}

const ANGLE_ADDRESS = /<([^>]+)>\s*$/

/**
 * The bare, lowercase address of a `fromAddress` that may be stored as
 * `Name <email>`. Compare and derive domains from this, never from the display form.
 */
export const extractEmailAddress = (value: string): string => {
  const match = value.match(ANGLE_ADDRESS)
  return (match ? match[1] : value).trim().toLowerCase()
}

export const generateMessageId = (fromAddress: string): string => {
  const domain = extractEmailAddress(fromAddress).split("@")[1] || "localhost"
  return `<${globalThis.crypto.randomUUID()}@${domain}>`
}

/** `In-Reply-To` + bounded `References` chain for the reply. */
export const buildThreadHeaders = (
  thread: EmailThreadAttributes,
): { inReplyTo?: string; references?: string[] } => {
  const parent = thread.messageId ?? thread.inReplyTo
  if (!parent) {
    return {}
  }
  const chain = [...(thread.references ?? []), parent]
  const unique = [...new Set(chain)]
  return {
    inReplyTo: parent,
    references: unique.slice(-MAX_REFERENCES),
  }
}

const escapeHtml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")

/** Minimal, fully escaped text → HTML (paragraph per blank line, `<br>` per newline). */
export const textToHtml = (text: string): string =>
  text
    .split(PARAGRAPH_BREAK)
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`,
    )
    .join("")
