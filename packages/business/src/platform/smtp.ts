import type { SmtpCredential } from "@chatbotx.io/database/partials"
import type { SmtpTransportOptions } from "@chatbotx.io/mail/transport"
import { platformCredentialService } from "../platform-credential/service"

export type PlatformSmtpTransport = SmtpTransportOptions & {
  fromEmail: string
  fromName?: string
}

/** Maps a decrypted SMTP credential config onto the transport shape every caller sends mail with. */
export const toSmtpTransport = (
  config: SmtpCredential,
): PlatformSmtpTransport => {
  const { host, port, username, password, fromEmail, fromName } = config
  return { host, port, username, password, fromEmail, fromName }
}

/**
 * Platform-wide SMTP override: the `PlatformCredential` row with `userId = NULL`
 * and `type = "smtp"`. Returns undefined when unset so callers fall back to the
 * `SMTP_SERVER` / `SMTP_FROM` env transport. Deliberately NOT gated on the
 * license: an expired license must never silently break password-reset email.
 * Writing the row is the enterprise-gated part (see the /admin/smtp action).
 */
export const resolvePlatformSmtpTransport = async (): Promise<
  PlatformSmtpTransport | undefined
> => {
  const credential = await platformCredentialService.findDecryptedPlatform({
    type: "smtp",
  })
  if (!credential) {
    return
  }
  return toSmtpTransport(credential.config)
}
