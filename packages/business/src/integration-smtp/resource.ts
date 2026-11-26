import type { IntegrationSmtpModel } from "@chatbotx.io/database/types"
import type { IntegrationSmtpResource } from "./schema"

/** Only the provider name of the stored auth; the rest of it is secret. */
const readProvider = (auth: unknown): string => {
  const provider =
    typeof auth === "object" && auth !== null
      ? (auth as { provider?: unknown }).provider
      : undefined
  return typeof provider === "string" ? provider : "other"
}

/**
 * Public projection of a row. Never spread the row: it carries `auth`
 * (the SMTP/IMAP passwords).
 */
export const toResource = (
  row: Pick<
    IntegrationSmtpModel,
    | "id"
    | "name"
    | "fromAddress"
    | "imapEnabled"
    | "imapHost"
    | "imapPort"
    | "imapMailbox"
    | "lastPolledAt"
    | "lastPollError"
    | "auth"
    | "inboundToken"
  >,
): IntegrationSmtpResource => ({
  id: row.id,
  name: row.name,
  fromAddress: row.fromAddress,
  imapEnabled: row.imapEnabled,
  imapHost: row.imapHost,
  imapPort: row.imapPort,
  imapMailbox: row.imapMailbox,
  lastPolledAt: row.lastPolledAt,
  lastPollError: row.lastPollError,
  provider: readProvider(row.auth),
  inboundWebhookIssued: Boolean(row.inboundToken),
})
