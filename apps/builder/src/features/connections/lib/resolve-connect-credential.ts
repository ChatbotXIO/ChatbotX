import "server-only"

import { platformCredentialService } from "@chatbotx.io/business"
import { CONNECTION_REGISTRY } from "@chatbotx.io/connections"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import { buildProviderCallbackUrl } from "@/lib/provider-origin"

/**
 * The registered OAuth `redirect_uri` path per provider — matches the
 * existing per-provider `case` branches in
 * `apps/builder/src/app/integrations/[...integration]/callback.ts` exactly.
 * Most `IntegrationType` keys are already the callback slug (`messenger`,
 * `instagram`, `tiktok`, `zalo`); four are camelCase registry keys with a
 * kebab-case callback path already registered with the provider (changing
 * either would need a new `redirect_uri` allow-listed with each provider,
 * so this map — not a generic `camelCase -> kebab-case` transform — is the
 * source of truth).
 */
const OAUTH_CALLBACK_SLUG: Partial<Record<IntegrationType, string>> = {
  instagramFacebook: "instagram-facebook",
  facebookAds: "facebook-ads",
  googleCalendar: "google-calendar",
  googleSheets: "google-sheets",
}

/**
 * Resolves the tenant-aware platform credential + callback URL an OAuth
 * connect (`startSession`/`reconnect`) needs, for whichever `IntegrationType`
 * the caller wants to connect. `ownerId` is pre-resolved by the caller —
 * `resolveOwnerForWorkspace` for a workspace-token request (no interactive
 * user), `resolvePlatformOwnerId` for a signed-in builder session — so this
 * helper stays auth-context-agnostic and is shared by the public and private
 * routers.
 *
 * Returns `null` when the provider isn't OAuth-configured (no
 * `credentialType` registered, e.g. a credential-strategy or built-in
 * provider) or the owner has no credential configured for it yet.
 */
export async function resolveOAuthCredential(input: {
  provider: IntegrationType
  ownerId: string
}): Promise<{
  credential: Record<string, unknown>
  callbackUrl: string
} | null> {
  const adapter = CONNECTION_REGISTRY[input.provider]
  if (!adapter?.credentialType) {
    return null
  }
  const resolved = await platformCredentialService.resolveForOwner({
    ownerId: input.ownerId,
    type: adapter.credentialType,
  })
  if (!resolved) {
    return null
  }
  const slug = OAUTH_CALLBACK_SLUG[input.provider] ?? input.provider
  const callbackUrl = await buildProviderCallbackUrl(
    resolved,
    `/integrations/${slug}/callback`,
  )
  return {
    // `CredentialByType[T]` is provider-specific and this call site is
    // deliberately generic across every `IntegrationType` — same erasure
    // `ConnectionCredential = unknown` already models on the SDK side.
    credential: resolved.config as Record<string, unknown>,
    callbackUrl,
  }
}
