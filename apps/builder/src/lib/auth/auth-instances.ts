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
import {
  customDomainService,
  platformCredentialService,
} from "@chatbotx.io/business"
import type { CredentialType } from "@chatbotx.io/database/partials"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import { isCommunity } from "@/env"
import { getBrokerOrigin } from "@/lib/oauth-broker"
import { onUserCreated } from "./on-user-created"
import {
  FACEBOOK_SSO_SCOPES,
  upgradeFacebookAccount,
} from "./upgrade-facebook-account"

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
 * The key folds in the client id, the client secret, AND (for Facebook) the
 * Meta API `version`, so a reseller rotating their OAuth secret — or just
 * bumping the API version while keeping the same clientId/secret — resolves
 * to a fresh instance instead of reusing one whose `upgradeOAuthAccount`
 * closure was built once with the now-stale secret/version. The set of
 * distinct credentials is small and bounded (platform defaults + the
 * resellers who registered their own), so orphaned post-rotation entries stay
 * negligible.
 */
const instancesByProvider: Record<SocialProvider, Map<string, Auth>> = {
  google: new Map(),
  facebook: new Map(),
}

/** A resolved credential, carrying the Meta API `version` for Facebook. */
type FacebookAwareCredential = SocialAuthCredential & { version?: string }

/**
 * A stable, non-reversible cache key for a credential (client id + secret +
 * version + redirect origin) — a domain activation for a tenant-owned
 * credential must resolve to a fresh instance, since `redirectURI` is frozen
 * into the instance at creation (see module doc comment).
 */
function credentialKey(
  credential: FacebookAwareCredential | null,
  redirectOrigin: string,
): string {
  if (!credential) {
    return NO_CREDENTIAL_KEY
  }
  return createHash("sha256")
    .update(
      `${credential.clientId} ${credential.clientSecret} ${credential.version ?? ""} ${redirectOrigin}`,
    )
    .digest("hex")
}

function getAuthForCredential(
  provider: SocialProvider,
  credential: FacebookAwareCredential | null,
  redirectOrigin: string,
): Auth {
  const cache = instancesByProvider[provider]
  const key = credentialKey(credential, redirectOrigin)
  const cached = cache.get(key)
  if (cached) {
    return cached
  }

  const instance = createAuth({
    socialCredentials: { [provider]: credential },
    socialRedirectOrigin: redirectOrigin,
    onUserCreated,
    // Facebook SSO requests the same Messenger-grade scopes as the channel
    // connect flow (so the token can later be reused to list Pages) and
    // upgrades the short-lived token it gets into a long-lived one before
    // persisting it — see `upgrade-facebook-account.ts`.
    ...(provider === "facebook" &&
      credential && {
        socialScopes: { facebook: FACEBOOK_SSO_SCOPES },
        upgradeOAuthAccount: upgradeFacebookAccount({
          clientId: credential.clientId,
          clientSecret: credential.clientSecret,
          version: credential.version ?? DEFAULT_MESSENGER_API_VERSION,
        }),
      }),
  })
  cache.set(key, instance)
  return instance
}

/** Fallback only reached if a resolved messenger credential is somehow missing `version` (schema requires it). */
const DEFAULT_MESSENGER_API_VERSION = "v23.0"

type TenantCredentialResolution = {
  credential: FacebookAwareCredential | null
  /** The origin the social `redirectURI` must be pinned to for this credential. */
  redirectOrigin: string
}

/**
 * The origin a tenant's social `redirectURI` must be pinned to: the
 * reseller's active custom domain for a tenant-owned credential (their own
 * app, on a non-root tenant), else the broker.
 */
async function resolveTenantSocialRedirectOrigin(
  credentialOwnerId: string | null | undefined,
  tenantId: string,
): Promise<string> {
  if (!(credentialOwnerId && tenantId !== ROOT_TENANT_ID)) {
    return getBrokerOrigin()
  }
  const domain = await customDomainService.findActiveByTenantId(tenantId)
  return domain ? `https://${domain.domain}` : getBrokerOrigin()
}

/**
 * The credential a tenant signs in with for `provider`: the reseller's own app
 * when they configured one (and their tenant is active), otherwise the platform
 * default. `credential` is `null` when neither resolves or the secret is
 * incomplete. `redirectOrigin` is the reseller's active custom domain for a
 * tenant-owned credential (their own app, on a non-root tenant), else the
 * broker.
 */
async function resolveCredentialForTenant(
  tenantId: string,
  provider: SocialProvider,
): Promise<TenantCredentialResolution> {
  // Community edition ships without social sign-in (email/password + magic
  // link only). Resolving no credential builds the better-auth instance with
  // zero social providers, so /api/auth/sign-in/social, OAuth callbacks, and
  // link-social all reject — and the sign-in pages hide the buttons since
  // isSocialLoginEnabledForTenant derives from this same resolver.
  if (isCommunity()) {
    return { credential: null, redirectOrigin: getBrokerOrigin() }
  }

  const type = PROVIDER_CREDENTIAL_TYPE[provider]
  const decrypted =
    tenantId === ROOT_TENANT_ID
      ? await platformCredentialService.findDecryptedPlatform({ type })
      : await resolveResellerCredential(tenantId, type)

  const redirectOrigin = await resolveTenantSocialRedirectOrigin(
    decrypted?.userId,
    tenantId,
  )

  const clientId = decrypted?.config.clientId
  const clientSecret = decrypted?.config.clientSecret
  if (!(clientId && clientSecret)) {
    return { credential: null, redirectOrigin }
  }

  return {
    credential: {
      clientId,
      clientSecret,
      version:
        provider === "facebook"
          ? (decrypted?.config as { version: string }).version
          : undefined,
    },
    redirectOrigin,
  }
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
  const { credential, redirectOrigin } = await resolveCredentialForTenant(
    tenantId,
    provider,
  )
  return getAuthForCredential(provider, credential, redirectOrigin)
}

/** Whether `provider` login resolves for the given tenant (drives button visibility). */
export async function isSocialLoginEnabledForTenant(
  tenantId: string,
  provider: SocialProvider,
): Promise<boolean> {
  const { credential } = await resolveCredentialForTenant(tenantId, provider)
  return credential !== null
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
