/** Largest raw mail source kept per message; the rest of the body is cut off. */
export const MAX_RAW_SOURCE_BYTES = 5 * 1024 * 1024
/** Mails fetched per inbox per poll; the rest waits for the next poll. */
export const MAX_MESSAGES_PER_POLL = 50
export const MAX_ATTACHMENTS_PER_EMAIL = 10
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
/** Cap on the sanitised-nowhere HTML kept in `contentAttributes.email.html`. */
export const MAX_STORED_HTML_CHARS = 50_000
export const MAX_REFERENCES = 20
export const DEFAULT_IMAP_MAILBOX = "INBOX"
export const IMAP_CONNECT_TIMEOUT_MS = 20_000
