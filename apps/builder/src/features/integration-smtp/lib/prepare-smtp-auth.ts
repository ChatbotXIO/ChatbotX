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
 * `docs/developer/workspace-api-tokens.md`.
 *
 * `resolveSmtpHostAndPort` needs `smtpHostMap` from
 * `@chatbotx.io/integration-smtp`, which `packages/business` must not depend
 * on, so this orchestration stays in the app layer rather than the service —
 * the service still owns the auth merge, change diff, and audit record.
 */
export async function prepareSmtpAuth(
  input: SmtpConnectionInput,
): Promise<{ host: string; port: number }> {
  await verifySmtpConnection(input)

  return resolveSmtpHostAndPort(input.provider, {
    host: input.host,
    port: input.port,
  })
}
