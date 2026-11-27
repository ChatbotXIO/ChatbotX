import { SdkException } from "@chatbotx.io/sdk"
import { DEFAULT_IMAP_MAILBOX } from "../inbound/constants"
import { verifyImapConnection } from "../inbound/imap"
import type { SmtpAuthValue } from "../schema"

export type ImapSettings = {
  host: string
  port: number
  mailbox?: string | null
}

/** Mailbox login: dedicated IMAP credentials when set, else the SMTP ones. */
export const resolveImapConnection = (
  auth: SmtpAuthValue,
  settings: ImapSettings,
) => ({
  host: settings.host,
  port: settings.port,
  username: auth.imapUsername ?? auth.username,
  password: auth.imapPassword ?? auth.password,
  mailbox: settings.mailbox?.trim() || DEFAULT_IMAP_MAILBOX,
})

/** Connect-time check: throws a user-facing `SdkException` when login fails. */
export const verifyImap = async (
  auth: SmtpAuthValue,
  settings: ImapSettings,
): Promise<void> => {
  try {
    await verifyImapConnection(resolveImapConnection(auth, settings))
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error"
    throw new SdkException(`IMAP connection failed: ${reason}`)
  }
}
