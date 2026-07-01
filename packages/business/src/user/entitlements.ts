import { getLicenseStatus } from "../enterprise/license/service"
import { isCloud, isEnterprise } from "../keys"

/**
 * Whether the current edition unlocks branding, email templates, and platform
 * help links. Cloud is controlled by deployment edition; self-hosted enterprise
 * must present a valid offline license.
 */
export const hasEnterpriseFeatures = async (): Promise<boolean> => {
  if (isCloud()) {
    return true
  }

  if (!isEnterprise()) {
    return false
  }

  const license = await getLicenseStatus()
  return license.state === "valid"
}
