import { parseEnvBool } from "@chatbotx.io/utils"
import { keys } from "../keys"
import { hasEnterpriseFeatures } from "../user/entitlements"

export const isSupportConsentRequired = async (): Promise<boolean> => {
  const requireConsent = keys().SUPPORT_ACCESS_REQUIRE_CONSENT
  if (requireConsent === undefined || parseEnvBool(requireConsent)) {
    return true
  }

  return !(await hasEnterpriseFeatures())
}
