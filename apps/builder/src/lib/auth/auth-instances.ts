import {
  type Auth,
  createAuth,
  type GoogleAuthCredential,
} from "@chatbotx.io/auth/server"
import {
  resolveTenantByDomain,
  resolveTenantOwnerId,
} from "@chatbotx.io/auth/tenant"
import { platformCredentialService } from "@chatbotx.io/business"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"

/**
 * White-label Google login.
 *
 * better-auth freezes social-provider config at init — the `socialProviders`
 * thunk runs once, with no request/tenant context, and the resulting provider
 * captures `clientId`/`clientSecret` in a closure for the process lifetime. So a
 * single auth instance can only ever sign in with one Google app. To let each
 * reseller use *their own* Google app (their brand on the consent screen), we
 * build a separate auth instance per distinct Google credential and cache it.
 *
 * The set of distinct Google apps is small and bounded (the platform default
 * plus the resellers who registered their own), so the cache stays tiny. Every
 * instance shares the same secret, cookies, adapter and session config, so a
 * session minted by the Google instance is read back by the default `auth`
 * instance used elsewhere (middleware, proxy).
 */

const NO_GOOGLE_KEY = "__none__"

const instancesByClientId = new Map<string, Auth>()

function getAuthForCredential(credential: GoogleAuthCredential | null): Auth {
  const key = credential?.clientId ?? NO_GOOGLE_KEY
  const cached = instancesByClientId.get(key)
  if (cached) {
    return cached
  }

  const instance = createAuth({ googleCredential: credential })
  instancesByClientId.set(key, instance)
  return instance
}

/**
 * The Google credential a tenant signs in with: the reseller's own app when they
 * configured one (and their tenant is active), otherwise the platform default.
 * Returns `null` when neither resolves or the secret is incomplete.
 */
async function resolveGoogleCredentialForTenant(
  tenantId: string,
): Promise<GoogleAuthCredential | null> {
  const decrypted =
    tenantId === ROOT_TENANT_ID
      ? await platformCredentialService.findDecryptedPlatform({
          type: "google",
        })
      : await resolveResellerGoogleCredential(tenantId)

  const clientId = decrypted?.config.clientId
  const clientSecret = decrypted?.config.clientSecret
  if (!(clientId && clientSecret)) {
    return null
  }

  return { clientId, clientSecret }
}

function resolveResellerGoogleCredential(tenantId: string) {
  return resolveTenantOwnerId(tenantId).then((ownerId) =>
    ownerId
      ? platformCredentialService.resolveForOwner({ ownerId, type: "google" })
      : platformCredentialService.findDecryptedPlatform({ type: "google" }),
  )
}

/** The auth instance that signs in Google users for the given tenant. */
export async function getGoogleAuthForTenant(tenantId: string): Promise<Auth> {
  return getAuthForCredential(await resolveGoogleCredentialForTenant(tenantId))
}

/** Whether Google login resolves for the given tenant (drives button visibility). */
export async function isGoogleLoginEnabledForTenant(
  tenantId: string,
): Promise<boolean> {
  return (await resolveGoogleCredentialForTenant(tenantId)) !== null
}

/** Whether Google login resolves for the tenant that owns the given domain. */
export async function isGoogleLoginEnabledForDomain(
  domain: string | null | undefined,
): Promise<boolean> {
  return isGoogleLoginEnabledForTenant(await resolveTenantByDomain(domain))
}
