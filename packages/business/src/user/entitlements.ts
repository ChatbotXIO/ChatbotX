import {
  getLicenseStatus,
  isLicenseEntitled,
} from "../enterprise/license/service"
import { ChatbotXException } from "../errors"
import { isCloud, isEnterprise } from "../keys"

/**
 * Whether the current edition unlocks branding, email templates, and platform
 * help links. Both cloud and self-hosted enterprise must present a valid
 * license — or one still inside its 7-day post-expiry grace window — setting
 * NEXT_PUBLIC_EDITION alone never unlocks features.
 */
export const hasEnterpriseFeatures = async (): Promise<boolean> => {
  if (!(isCloud() || isEnterprise())) {
    return false
  }

  const license = await getLicenseStatus()
  return isLicenseEntitled(license.state)
}

export const enterpriseFeatureRequiredException = () =>
  new ChatbotXException(
    "This feature requires an enterprise license",
    "enterpriseFeatureRequired",
    403,
  )

/**
 * Server-side guard for enterprise-only mutations and queries. Throws a 403
 * ChatbotXException when the deployment has no valid license, so it works in
 * server actions, oRPC handlers, and plain queries alike.
 */
export const assertEnterpriseFeatures = async (): Promise<void> => {
  if (!(await hasEnterpriseFeatures())) {
    throw enterpriseFeatureRequiredException()
  }
}
