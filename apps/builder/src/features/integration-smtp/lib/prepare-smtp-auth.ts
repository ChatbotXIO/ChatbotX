import type { SmtpAuthValue } from "@chatbotx.io/integration-smtp"
import { resolveSmtpHostAndPort } from "./smtp-host"
import { verifySmtpConnection } from "./verify-connection"

type SmtpConnectionInput = {
  provider: Parameters<typeof resolveSmtpHostAndPort>[0]
  host: string
  port: number
  username: string
  password: string
  fromAddress: string
}

/**
 * Verifies the caller-supplied SMTP credentials actually connect, then
 * resolves the effective host/port for the chosen provider. Shared by both
 * actions (`create-smtp.action.ts`, `update-smtp.action.ts`) and both public
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
export async function prepareSmtpAuth(input: SmtpConnectionInput): Promise<{
  host: string
  port: number
  auth: SmtpAuthValue
}> {
  await verifySmtpConnection(input)

  const { host, port } = resolveSmtpHostAndPort(input.provider, {
    host: input.host,
    port: input.port,
  })
  return {
    host,
    port,
    auth: {
      authType: "custom",
      provider: input.provider,
      host,
      port,
      username: input.username,
      password: input.password,
    },
  }
}
