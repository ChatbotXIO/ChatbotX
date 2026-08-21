import {
  type SourceScopedIdentity,
  shouldAddressBySourceUserId,
} from "@chatbotx.io/sdk"

export type WhatsappRecipientParams = { to: string } | { recipient: string }

/**
 * Resolves the WhatsApp Cloud API recipient params for an outgoing send.
 *
 * Identities that must be addressed by their BSUID (see
 * {@link shouldAddressBySourceUserId}: BSUID-keyed rows, and rows with an
 * empty `sourceId` but a known BSUID) send via `recipient`; phone-keyed
 * identities keep sending via `to` (today's behavior, regression-safe).
 *
 * This distinction matters: sending a BSUID in `to` is silently dropped by
 * Meta (HTTP 200 + wamid returned, but nothing is delivered), and sending
 * `to: ""` fails outright — the production bugs this resolver exists to
 * prevent.
 */
export const resolveRecipientParams = (
  identity: SourceScopedIdentity,
): WhatsappRecipientParams => {
  if (shouldAddressBySourceUserId(identity) && identity.sourceUserId) {
    return { recipient: identity.sourceUserId }
  }
  return { to: identity.sourceId }
}

/**
 * `whatsapp-api-js`'s lib sender can only emit `to`; params carrying
 * `recipient` must route through the raw poster so the field actually
 * reaches the request body.
 */
export const isBsuidRecipient = (
  params: WhatsappRecipientParams,
): params is { recipient: string } => "recipient" in params
