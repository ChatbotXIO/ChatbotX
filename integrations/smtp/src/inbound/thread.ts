export type EmailThread = {
  inReplyTo?: string
  messageId: string
  references: string[]
}

/**
 * The stable root key for an RFC 5322 thread. References retains the root even
 * when the chain is capped, so every descendant converges on this key.
 */
export const emailThreadKey = (email: EmailThread): string =>
  email.references[0] ?? email.inReplyTo ?? email.messageId
