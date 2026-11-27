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

/** The stored columns `toResource` reads, secrets included. */
export type IntegrationSmtpResourceSource = Pick<
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
>

/**
 * Public projection of a row. Never spread the row: it carries `auth`
 * (the SMTP/IMAP passwords).
 */
export const toResource = (
  row: IntegrationSmtpResourceSource,
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

/** A row whose `integrationSmtp` has been swapped for its public projection. */
export type WithSmtpResource<T> = Omit<T, "integrationSmtp"> & {
  integrationSmtp?: IntegrationSmtpResource | null
}

/**
 * Swaps each row's eager-loaded `integrationSmtp` (which carries `auth`, the
 * SMTP/IMAP passwords) for its public projection. Rows loaded without the
 * relation pass through unchanged.
 */
export const projectIntegrationSmtp = <
  T extends {
    id: string
    integrationSmtp?: IntegrationSmtpResourceSource | null
  },
>(
  rows: T[],
): WithSmtpResource<T>[] =>
  rows.map((row) => {
    if (!row.integrationSmtp) {
      return row as WithSmtpResource<T>
    }
    return { ...row, integrationSmtp: toResource(row.integrationSmtp) }
  })
