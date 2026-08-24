import "server-only"
import { customDomainService, tenantService } from "@chatbotx.io/business"
import { cache } from "react"
import { isCloud } from "@/env"
import { getBrokerOrigin } from "@/lib/oauth-broker"

/**
 * A tenant-owned platform credential (`Credential.userId` set) belongs to a
 * reseller who registered their own provider app — they can (and must)
 * whitelist their own custom domain instead of the broker. Everything else
 * (inherited credentials, `"platform"` scope, self-hosted editions, a
 * suspended tenant, or a tenant with no active domain) stays on the broker,
 * because the reseller either doesn't control a distinct app or isn't
 * reachable on a domain of their own.
 */

/**
 * The reseller's active custom domain origin, or `null` when they don't have
 * one (self-hosted, suspended tenant, no active domain). Cached per-request
 * on the primitive `ownerId` — see `resolveTenantOwnerIdCached` in
 * `lib/platform-credential-owner.ts` for why the cache key must be a string.
 */
export const resolveTenantCustomDomainOrigin = cache(
  async (ownerId: string): Promise<string | null> => {
    if (!isCloud()) {
      return null
    }

    const tenant = await tenantService.findByOwner(ownerId)
    if (tenant?.status !== "active") {
      return null
    }

    const domain = await customDomainService.findActiveByTenantId(tenant.id)
    return domain ? `https://${domain.domain}` : null
  },
)

/**
 * The concrete origin a server-side OAuth/webhook URL must use for this
 * owner: the tenant's custom domain when they have one, else the broker.
 * Always returns a usable origin — callers that build an actual
 * `redirect_uri` never need to special-case "no domain".
 */
export async function resolveTenantProviderOrigin(
  ownerId: string,
): Promise<string> {
  return (await resolveTenantCustomDomainOrigin(ownerId)) ?? getBrokerOrigin()
}

/** Display-only placeholder shown when a tenant-owned credential has no active domain yet. */
export const PLACEHOLDER_DOMAIN_ORIGIN = "https://<your-domain.com>"

/**
 * The origin to use for a given credential: the owning tenant's custom
 * domain for tenant-owned credentials (`userId` set), the broker for
 * platform-owned ones (`userId` null).
 */
export function resolveProviderOriginForCredential(credential?: {
  userId: string | null
}): Promise<string> {
  return credential?.userId
    ? resolveTenantProviderOrigin(credential.userId)
    : Promise.resolve(getBrokerOrigin())
}

/** Build an absolute callback URL on the correct origin for the given credential. */
export async function buildProviderCallbackUrl(
  credential: { userId: string | null } | undefined,
  path: string,
): Promise<string> {
  const origin = await resolveProviderOriginForCredential(credential)
  return new URL(path, origin).toString()
}
