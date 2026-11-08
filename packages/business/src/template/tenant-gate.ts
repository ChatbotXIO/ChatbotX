import { ROOT_TENANT_ID } from "@chatbotx.io/database/partials"

type CopyTenants = {
  /** The tenant of the template. */
  templateTenantId: string
  /** The tenant of the workspace the copy lives in. */
  targetTenantId: string
}

/**
 * Whether a workspace of `targetTenantId` may install a template of
 * `templateTenantId`: its own tenant's, or the platform's (root tenant), whose
 * templates are offered to every white-label tenant. Any other template never
 * leaves its tenant.
 */
export const canInstallFromTenant = (input: CopyTenants): boolean =>
  input.targetTenantId === input.templateTenantId ||
  input.templateTenantId === ROOT_TENANT_ID

/**
 * A copy installed across tenants (a platform template in a white-label
 * workspace). Its publisher never sees the workspace or removes the copy.
 */
export const isCrossTenantCopy = (input: CopyTenants): boolean =>
  input.targetTenantId !== input.templateTenantId
