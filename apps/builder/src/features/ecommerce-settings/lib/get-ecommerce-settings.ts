import "server-only"
import { ecommerceSettingsService } from "@chatbotx.io/business"
import type { EcommerceSettingsPublicResource } from "../schema/public"

/**
 * The settings with what the page and the API both show next to them: which
 * Pro settings are allowed and how many products are priced in another
 * currency.
 */
export async function getEcommerceSettings(
  workspaceId: string,
): Promise<EcommerceSettingsPublicResource> {
  const settings = await ecommerceSettingsService.get(workspaceId)
  const [proFeatures, productsInOtherCurrency] = await Promise.all([
    ecommerceSettingsService.resolveProFeatures(workspaceId),
    ecommerceSettingsService.countProductsInOtherCurrency({
      workspaceId,
      currency: settings.payments.currency,
    }),
  ])
  return { ...settings, proFeatures, productsInOtherCurrency }
}
