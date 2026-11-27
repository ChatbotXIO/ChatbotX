import { tenantService } from "../enterprise/tenant/service"
import { userQuotaService } from "../user-quota/service"

export function hasOwnCredentialAccess(
  tenant: { status: string } | null | undefined,
  quota: { customAppCredentials: boolean } | null | undefined,
): boolean {
  return tenant?.status === "active" || Boolean(quota?.customAppCredentials)
}

/**
 * Whether an owner may use credentials registered under their own account.
 * Active tenants retain their white-label capability even when a plan override
 * disables customAppCredentials; all other users require the effective quota
 * value so the default-plan overlay participates in the decision.
 */
export async function canUseOwnCredentials(ownerId: string): Promise<boolean> {
  const tenant = await tenantService.findByOwner(ownerId)
  if (tenant?.status === "active") {
    return true
  }

  const quota = await userQuotaService.getForUser(ownerId)
  return hasOwnCredentialAccess(tenant, quota)
}
