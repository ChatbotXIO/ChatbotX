import type { SmtpImapInput } from "@chatbotx.io/business"
import type { SmtpAuthValue } from "@chatbotx.io/integration-smtp"
import {
  DEFAULT_IMAP_MAILBOX,
  imapHostMap,
} from "@chatbotx.io/integration-smtp/schema"
import type { ImapSettingsRequest } from "../schema/mutation"
import { resolveSmtpHostAndPort } from "./smtp-host"
import { verifySmtpConnection } from "./verify-connection"
import { verifyImapLogin } from "./verify-imap"

type SmtpConnectionInput = {
  provider: Parameters<typeof resolveSmtpHostAndPort>[0]
  host: string
  port: number
  username: string
  password: string
  fromAddress: string
  imap?: ImapSettingsRequest
}

export type PreparedSmtpAuth = {
  host: string
  port: number
  /** Verified SMTP auth (including any separate IMAP login) for connect/update and the authorization backup. */
  auth: SmtpAuthValue
  /** Resolved IMAP settings; `undefined` when the caller left receiving untouched. */
  imap?: SmtpImapInput
  imapUsername?: string
  imapPassword?: string
}

/** Pins a known provider's IMAP endpoint; `other` keeps what the caller typed. */
const resolveImapEndpoint = (
  provider: SmtpConnectionInput["provider"],
  imap: ImapSettingsRequest,
): { host: string; port: number } => {
  const preset = imapHostMap[provider]
  if (preset && provider !== "other") {
    return preset
  }
  return { host: imap.host ?? "", port: imap.port ?? 0 }
}

/**
 * Verifies the caller-supplied SMTP credentials actually connect, then
 * resolves the effective host/port for the chosen provider. When receiving is
 * enabled the IMAP login is verified the same way. Shared by both actions
 * (`create-smtp.action.ts`, `update-smtp.action.ts`) and both public
 * API handlers (`api/public.ts`) so the four call sites can't drift on
 * verification or host/port resolution — see the Channels scope note in
 * `docs/developer/workspace-api-tokens.md`. It also returns the verified SMTP
 * `auth` used to connect/update and for the authorization backup.
 *
 * `resolveSmtpHostAndPort` needs `smtpHostMap` from
 * `@chatbotx.io/integration-smtp`, which `packages/business` must not depend
 * on, so this orchestration stays in the app layer rather than the service —
 * the service still owns the auth merge, change diff, and audit record.
 */
export async function prepareSmtpAuth(
  input: SmtpConnectionInput,
): Promise<PreparedSmtpAuth> {
  await verifySmtpConnection(input)

  const { host, port } = resolveSmtpHostAndPort(input.provider, {
    host: input.host,
    port: input.port,
  })
  const { imap } = input
  const buildAuth = (
    imapLogin: { imapUsername?: string; imapPassword?: string } = {},
  ): SmtpAuthValue => ({
    authType: "custom",
    provider: input.provider,
    host,
    port,
    username: input.username,
    password: input.password,
    ...imapLogin,
  })
  if (!imap) {
    return { host, port, auth: buildAuth() }
  }
  if (!imap.enabled) {
    return {
      host,
      port,
      auth: buildAuth(),
      imap: { enabled: false, host: null, port: null, mailbox: null },
    }
  }

  const endpoint = resolveImapEndpoint(input.provider, imap)
  const mailbox = imap.mailbox ?? DEFAULT_IMAP_MAILBOX
  await verifyImapLogin({
    ...endpoint,
    mailbox,
    username: imap.username ?? input.username,
    password: imap.password ?? input.password,
  })

  return {
    host,
    port,
    auth: buildAuth({
      imapUsername: imap.username,
      imapPassword: imap.password,
    }),
    imap: { enabled: true, ...endpoint, mailbox },
    imapUsername: imap.username,
    imapPassword: imap.password,
  }
}
