import type { GoogleAdsConsentLoad } from "@chatbotx.io/business"
import type { GoogleAdsConsentSource } from "@chatbotx.io/database/partials"
import type {
  GoogleAdsConsentSettingView,
  GoogleAdsConsentView,
} from "../schema/integration"

const toSettingView = (
  source: GoogleAdsConsentSource,
): GoogleAdsConsentSettingView => ({
  type: source.type,
  template: source.type === "variable" ? source.template : null,
})

/**
 * Plain, serializable projection of the stored consent for the settings page
 * and the public API. Loaded independently of the setup (it outlives a
 * disconnect), so it is built from `getConsent` alone. `invalid` carries no
 * settings: nothing trustworthy can be shown for an unreadable document.
 */
export const toConsentView = (
  load: GoogleAdsConsentLoad,
): GoogleAdsConsentView => {
  if (load.status === "invalid") {
    return { status: "invalid", adUserData: null, adPersonalization: null }
  }
  return {
    status: load.status,
    adUserData: toSettingView(load.consent.adUserData),
    adPersonalization: toSettingView(load.consent.adPersonalization),
  }
}
