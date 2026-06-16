import { createHash } from "node:crypto"
import {
  type Auth,
  createAuth,
  type SocialAuthCredential,
  type SocialProvider,
} from "@chatbotx.io/auth/server"
import {
  resolveTenantByDomain,
  resolveTenantOwnerId,
} from "@chatbotx.io/auth/tenant"
import { platformCredentialService } from "@chatbotx.io/business"
import type { CredentialType } from "@chatbotx.io/database/partials"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"

/**
 * White-label social login (Google, Facebook, …).
 *
 * better-auth freezes social-provider config at init — the `socialProviders`
 * thunk runs once, with no request/tenant context, and the resulting provider
 * captures `clientId`/`clientSecret` in a closure for the process lifetime. So a
 * single auth instance can only ever sign in with one app per provider. To let
 * each reseller use *their own* OAuth app (their brand on the consent screen),
 * we build a separate auth instance per distinct credential and cache it.
 *
 * The set of distinct apps is small and bounded (the platform defaults plus the
 * resellers who registered their own), so the cache stays tiny. Every instance
 * shares the same secret, cookies, adapter and session config, so a session
 * minted by one instance is read back by the default `auth` instance used
 * elsewhere (middleware, proxy).
 */

const NO_CREDENTIAL_KEY = "__none__"

/**
 * The platform-credential type each social provider's OAuth app is stored under.
 * Facebook login reuses the existing Meta app credential (the `messenger` row),
 * so resellers don't register a second Facebook app just to sign in. Narrowed to
 * the credential types that actually carry `clientId`/`clientSecret`.
 */
type SocialCredentialType = Extract<CredentialType, "google" | "messenger">

const PROVIDER_CREDENTIAL_TYPE: Record<SocialProvider, SocialCredentialType> = {
  google: "google",
  facebook: "messenger",
}

/**
 * One instance cache per provider, keyed by a fingerprint of the credential.
 *
 * The key folds in BOTH the client id and the client secret, so a reseller
 * rotating their OAuth secret — even keeping the same client id — resolves to a
 * fresh instance instead of signing users in with the now-stale secret captured
 * in the old instance's closure. The set of distinct credentials is small and
 * bounded (platform defaults + the resellers who registered their own), so
 * orphaned post-rotation entries stay negligible.
 */
const instancesByProvider: Record<SocialProvider, Map<string, Auth>> = {
  google: new Map(),
  facebook: new Map(),
}

/** A stable, non-reversible cache key for a credential (client id + secret). */
function credentialKey(credential: SocialAuthCredential | null): string {
  if (!credential) {
    return NO_CREDENTIAL_KEY
  }
  return createHash("sha256")
    .update(`${credential.clientId} ${credential.clientSecret}`)
    .digest("hex")
}

function getAuthForCredential(
  provider: SocialProvider,
  credential: SocialAuthCredential | null,
): Auth {
  const cache = instancesByProvider[provider]
  const key = credentialKey(credential)
  const cached = cache.get(key)
  if (cached) {
    return cached
  }

  const instance = createAuth({ socialCredentials: { [provider]: credential } })
  cache.set(key, instance)
  return instance
}

/**
 * The credential a tenant signs in with for `provider`: the reseller's own app
 * when they configured one (and their tenant is active), otherwise the platform
 * default. Returns `null` when neither resolves or the secret is incomplete.
 */
async function resolveCredentialForTenant(
  tenantId: string,
  provider: SocialProvider,
): Promise<SocialAuthCredential | null> {
  const type = PROVIDER_CREDENTIAL_TYPE[provider]
  const decrypted =
    tenantId === ROOT_TENANT_ID
      ? await platformCredentialService.findDecryptedPlatform({ type })
      : await resolveResellerCredential(tenantId, type)

  const clientId = decrypted?.config.clientId
  const clientSecret = decrypted?.config.clientSecret
  if (!(clientId && clientSecret)) {
    return null
  }

  return { clientId, clientSecret }
}

function resolveResellerCredential(
  tenantId: string,
  type: SocialCredentialType,
) {
  return resolveTenantOwnerId(tenantId).then((ownerId) =>
    ownerId
      ? platformCredentialService.resolveForOwner({ ownerId, type })
      : platformCredentialService.findDecryptedPlatform({ type }),
  )
}

/** The auth instance that signs in `provider` users for the given tenant. */
export async function getSocialAuthForTenant(
  tenantId: string,
  provider: SocialProvider,
): Promise<Auth> {
  return getAuthForCredential(
    provider,
    await resolveCredentialForTenant(tenantId, provider),
  )
}

/** Whether `provider` login resolves for the given tenant (drives button visibility). */
export async function isSocialLoginEnabledForTenant(
  tenantId: string,
  provider: SocialProvider,
): Promise<boolean> {
  return (await resolveCredentialForTenant(tenantId, provider)) !== null
}

/** The social providers enabled for the tenant that owns the given domain. */
export async function resolveEnabledProvidersForDomain(
  domain: string | null | undefined,
  providers: readonly SocialProvider[],
): Promise<SocialProvider[]> {
  const tenantId = await resolveTenantByDomain(domain)
  const checks = await Promise.all(
    providers.map((provider) =>
      isSocialLoginEnabledForTenant(tenantId, provider),
    ),
  )
  return providers.filter((_, index) => checks[index])
}
