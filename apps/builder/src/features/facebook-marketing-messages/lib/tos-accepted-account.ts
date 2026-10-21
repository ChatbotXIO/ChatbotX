import "server-only"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { getMarketingMessagesAdAccounts } from "@chatbotx.io/integration-facebook-ads"
import { getTranslations } from "next-intl/server"
import type { MarketingMessagesGrant } from "./grant"
import { customAudienceTosUrl, isCustomAudienceTosAccepted } from "./tos"

/**
 * Re-validates the ad account server-side: the client select is a
 * convenience, not a boundary. The account must be visible to THIS grant and
 * have the custom-audience terms accepted.
 */
export async function requireTosAcceptedAdAccount(
  grant: Extract<MarketingMessagesGrant, { state: "valid" }>,
  adAccountId: string,
) {
  const accounts = await getMarketingMessagesAdAccounts(
    grant.accessToken,
    grant.version,
  )
  const account = accounts.find((row) => row.id === adAccountId)
  const t = await getTranslations()
  if (!account) {
    throw new ChatbotXException(
      t("facebookMarketingMessages.errors.notGranted"),
    )
  }
  if (!isCustomAudienceTosAccepted(account.tosAccepted)) {
    throw new ChatbotXException(
      t("facebookMarketingMessages.errors.tosNotAccepted", {
        url: customAudienceTosUrl(account.accountId),
      }),
    )
  }
  return account
}
