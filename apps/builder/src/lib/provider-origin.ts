import "server-only"
import { customDomainService, tenantService } from "@chatbotx.io/business"
import type { CredentialType } from "@chatbotx.io/database/partials"
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
 * The tenant state and active custom domain for a credential owner. Cached per
 * request on the primitive `ownerId`, so callers needing both values do not
 * repeat the tenant lookup.
 */
export const resolveCredentialOwnerOrigin = cache(
  async (
    ownerId: string,
  ): Promise<{
    customDomainOrigin: string | null
    hasActiveTenant: boolean
  }> => {
    if (!isCloud()) {
      return { customDomainOrigin: null, hasActiveTenant: false }
    }

    const tenant = await tenantService.findByOwner(ownerId)
    if (tenant?.status !== "active") {
      return { customDomainOrigin: null, hasActiveTenant: false }
    }

    const domain = await customDomainService.findActiveByTenantId(tenant.id)
    return {
      customDomainOrigin: domain ? `https://${domain.domain}` : null,
      hasActiveTenant: true,
    }
  },
)

/** The reseller's active custom domain origin, or `null` when unavailable. */
export const resolveTenantCustomDomainOrigin = async (ownerId: string) =>
  (await resolveCredentialOwnerOrigin(ownerId)).customDomainOrigin

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

/**
 * Build the provider webhook URL for a credential. Owners without an active
 * tenant use the broker's credential-scoped route so inbound signatures are
 * validated with their credential rather than the platform default.
 */
export function buildCredentialWebhookUrl(props: {
  credentialId?: string
  hasActiveTenant: boolean
  origin: string
  type: CredentialType
}): string {
  const { credentialId, hasActiveTenant, origin, type } = props
  const path =
    credentialId && !hasActiveTenant
      ? `/integrations/${type}/webhook/c/${credentialId}`
      : `/integrations/${type}/webhook`
  const normalizedOrigin = origin.endsWith("/") ? origin.slice(0, -1) : origin
  return `${normalizedOrigin}${path}`
}

/** Display-only placeholder shown when a tenant-owned credential has no active domain yet. */
export const PLACEHOLDER_DOMAIN_ORIGIN = "https://<your-domain.com>"

/** Origin displayed to configure a credential's callback and webhook URLs. */
export const resolveCredentialDisplayOrigin = (props: {
  brokerOrigin: string
  customDomainOrigin: string | null | undefined
  hasActiveTenant: boolean
  isInherited: boolean
}): string => {
  const { brokerOrigin, customDomainOrigin, hasActiveTenant, isInherited } =
    props
  if (isInherited || !hasActiveTenant) {
    return brokerOrigin
  }
  return customDomainOrigin ?? PLACEHOLDER_DOMAIN_ORIGIN
}

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
