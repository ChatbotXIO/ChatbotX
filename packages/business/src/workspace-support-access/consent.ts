import { parseEnvBool } from "@chatbotx.io/utils"
import { keys } from "../keys"
import { hasEnterpriseFeatures } from "../user/entitlements"

export const isSupportConsentRequired = async (): Promise<boolean> => {
  if (parseEnvBool(keys().SUPPORT_ACCESS_REQUIRE_CONSENT)) {
    return true
  }

  return !(await hasEnterpriseFeatures())
}
