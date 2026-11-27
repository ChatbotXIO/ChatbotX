import type { TenantDefaultTemplateStatus } from "@chatbotx.io/database/partials"
import type { tenantDefaultTemplateRepository } from "@chatbotx.io/database/repositories"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { isShareLive } from "./share-live"

type DefaultTemplateConfig = NonNullable<
  Awaited<ReturnType<typeof tenantDefaultTemplateRepository.findWithTemplate>>
>

/**
 * Whether a tenant's configured default template can install, and if not the
 * first reason. Shared by the settings page and the workspace-creation step,
 * so what the owner sees is exactly what a new workspace will do.
 */
export const resolveDefaultTemplateStatus = async (
  tenantId: string,
  config: DefaultTemplateConfig,
): Promise<TenantDefaultTemplateStatus> => {
  const { template } = config
  if (template.deletedAt || template.tenantId !== tenantId) {
    return "templateUnavailable"
  }
  if (!isShareLive(template)) {
    return "shareDisabled"
  }
  // The stored value is the digest of the key the owner entered, so a rotated
  // share token no longer matches.
  if ((await sha256Hex(template.shareToken)) !== config.keyHash) {
    return "keyRotated"
  }
  return "ready"
}
