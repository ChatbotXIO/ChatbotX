import { isCloud, isEnterprise } from "../keys"

/**
 * Whether the current edition unlocks branding, email templates, and platform
 * help links. Cloud is controlled by deployment edition; self-hosted enterprise
 * must present a valid offline license.
 *
 * FORK: self-hosted enterprise is unlocked WITHOUT an offline license. The
 * vendor EdDSA-signed `LICENSE_KEY` is not required in this fork — the repo is
 * self-owned, so `hasEnterpriseFeatures()` is true for any enterprise edition.
 */
export const hasEnterpriseFeatures = async (): Promise<boolean> => {
  if (isCloud()) {
    return true
  }

  if (!isEnterprise()) {
    return false
  }

  return true
}
