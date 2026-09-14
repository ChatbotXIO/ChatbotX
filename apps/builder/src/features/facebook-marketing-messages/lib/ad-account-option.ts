import type { MarketingMessagesAdAccount } from "@chatbotx.io/integration-facebook-ads"
import { customAudienceTosUrl, isCustomAudienceTosAccepted } from "./tos"

export type MarketingMessagesAdAccountOption = {
  id: string
  accountId: string
  name: string
  currency: string
  tosAccepted: boolean
  tosUrl: string
}

/**
 * Flatten Graph's ToS map into a boolean plus a ready remediation link, so the
 * client select never has to know Meta's key names or URL shape.
 *
 * Lives in `lib/` rather than beside the oRPC procedure that uses it: this is a
 * pure mapper, and importing it from `api/private.ts` would pull the whole
 * server graph (business layer -> database client -> server-only env) into any
 * test that only wants to exercise the mapping.
 */
export function toAdAccountOption(
  account: MarketingMessagesAdAccount,
): MarketingMessagesAdAccountOption {
  return {
    id: account.id,
    accountId: account.accountId,
    name: account.name ?? account.id,
    currency: account.currency,
    tosAccepted: isCustomAudienceTosAccepted(account.tosAccepted),
    tosUrl: customAudienceTosUrl(account.accountId),
  }
}
