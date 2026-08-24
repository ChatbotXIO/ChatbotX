import { platformCredentialService } from "@chatbotx.io/business"
import type {
  CredentialPublicByType,
  CredentialType,
} from "@chatbotx.io/database/partials"
import { isCloud } from "@/env"
import { getBrokerOrigin } from "@/lib/oauth-broker"
import {
  PLACEHOLDER_DOMAIN_ORIGIN,
  resolveTenantCustomDomainOrigin,
} from "@/lib/provider-origin"
import { GiphySettings } from "./giphy/giphy-settings"
import { GoogleSettings } from "./google/google-settings"
import { InstagramSettings } from "./instagram/instagram-settings"
import { InstagramFacebookSettings } from "./instagram-facebook/instagram-facebook-settings"
import { MakeSettings } from "./make/make-settings"
import { MessengerSettings } from "./messenger/messenger-settings"
import { CredentialScopeProvider } from "./provider/credential-scope-context"
import type { CredentialScope } from "./scope"
import { TiktokSettings } from "./tiktok/tiktok-settings"
import { WhatsappSettings } from "./whatsapp/whatsapp-settings"
import { ZaloSettings } from "./zalo/zalo-settings"

type ManagePlatformCredentialsProps = {
  /**
   * `"user"` (default): white-label customer editing their own credentials in
   * cloud, or the platform-global credentials when self-hosted.
   * `"platform"`: the SaaS operator editing the global default credentials.
   */
  scope?: CredentialScope
  userId?: string
}

type ResolvedCredential<T extends CredentialType> = {
  publicConfig: CredentialPublicByType[T] | null
  isInherited: boolean
}

/**
 * Resolve the public credential config for a manage-page card.
 *
 * - Reseller (user scope in cloud): their own credential. When none is set, the
 *   card is flagged `isInherited` (the platform default applies at runtime) but
 *   the platform's values are deliberately NOT returned — a reseller should only
 *   see the "Using platform default" badge, never the shared credential itself.
 * - Platform scope / self-hosted: the global credential, never inherited.
 */
async function resolveCard<T extends CredentialType>(
  scopedUserId: string | undefined,
  type: T,
): Promise<ResolvedCredential<T>> {
  if (scopedUserId === undefined) {
    const row = await platformCredentialService.findPlatform({ type })
    return { publicConfig: row?.publicConfig ?? null, isInherited: false }
  }

  const resolved = await platformCredentialService.resolvePublicForUser({
    userId: scopedUserId,
    type,
  })
  if (resolved?.isInherited) {
    return { publicConfig: null, isInherited: true }
  }
  return {
    publicConfig: resolved?.publicConfig ?? null,
    isInherited: false,
  }
}

export async function ManagePlatformCredentials({
  scope = "user",
  userId,
}: ManagePlatformCredentialsProps) {
  const isUserScope = scope === "user"
  const scopedUserId = isUserScope && isCloud() ? userId : undefined

  const [
    whatsappResult,
    messengerResult,
    instagramResult,
    instagramFacebookResult,
    googleResult,
    zaloResult,
    giphyResult,
    tiktokResult,
    makeResult,
  ] = await Promise.allSettled([
    resolveCard(scopedUserId, "whatsapp"),
    resolveCard(scopedUserId, "messenger"),
    resolveCard(scopedUserId, "instagram"),
    resolveCard(scopedUserId, "instagramFacebook"),
    resolveCard(scopedUserId, "google"),
    resolveCard(scopedUserId, "zalo"),
    resolveCard(scopedUserId, "giphy"),
    resolveCard(scopedUserId, "tiktok"),
    resolveCard(scopedUserId, "make"),
  ])

  const emptyCard = { publicConfig: null, isInherited: false } as const
  const whatsapp =
    whatsappResult.status === "fulfilled" ? whatsappResult.value : emptyCard
  const messenger =
    messengerResult.status === "fulfilled" ? messengerResult.value : emptyCard
  const instagram =
    instagramResult.status === "fulfilled" ? instagramResult.value : emptyCard
  const instagramFacebook =
    instagramFacebookResult.status === "fulfilled"
      ? instagramFacebookResult.value
      : emptyCard
  const google =
    googleResult.status === "fulfilled" ? googleResult.value : emptyCard
  const zalo = zaloResult.status === "fulfilled" ? zaloResult.value : emptyCard
  const giphy =
    giphyResult.status === "fulfilled" ? giphyResult.value : emptyCard
  const tiktok =
    tiktokResult.status === "fulfilled" ? tiktokResult.value : emptyCard
  const make = makeResult.status === "fulfilled" ? makeResult.value : emptyCard

  // For a tenant-owned credential (their own app), provider-facing URLs must
  // use the reseller's active custom domain — falling back to a literal
  // placeholder when they haven't activated one yet, never the broker (that
  // would silently mislead them into registering a host they don't control).
  // Inherited credentials always show the broker, since the platform app is
  // what's actually registered. See `lib/provider-origin.ts`.
  const tenantOrigin = scopedUserId
    ? ((await resolveTenantCustomDomainOrigin(scopedUserId)) ??
      PLACEHOLDER_DOMAIN_ORIGIN)
    : getBrokerOrigin()
  const brokerOrigin = getBrokerOrigin()
  const callbackOriginFor = (isInherited: boolean) =>
    isInherited ? brokerOrigin : tenantOrigin

  return (
    <CredentialScopeProvider scope={scope}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MessengerSettings
          callbackOrigin={callbackOriginFor(messenger.isInherited)}
          isInherited={messenger.isInherited}
          publicConfig={messenger.publicConfig}
        />
        <InstagramSettings
          callbackOrigin={callbackOriginFor(instagram.isInherited)}
          isInherited={instagram.isInherited}
          publicConfig={instagram.publicConfig}
        />
        <InstagramFacebookSettings
          callbackOrigin={callbackOriginFor(instagramFacebook.isInherited)}
          isInherited={instagramFacebook.isInherited}
          publicConfig={instagramFacebook.publicConfig}
        />
        <GoogleSettings
          callbackOrigin={callbackOriginFor(google.isInherited)}
          isInherited={google.isInherited}
          publicConfig={google.publicConfig}
        />
        <WhatsappSettings
          callbackOrigin={callbackOriginFor(whatsapp.isInherited)}
          isInherited={whatsapp.isInherited}
          publicConfig={whatsapp.publicConfig}
        />
        <ZaloSettings
          callbackOrigin={callbackOriginFor(zalo.isInherited)}
          isInherited={zalo.isInherited}
          publicConfig={zalo.publicConfig}
        />
        <TiktokSettings
          callbackOrigin={callbackOriginFor(tiktok.isInherited)}
          isInherited={tiktok.isInherited}
          publicConfig={tiktok.publicConfig}
        />
        <GiphySettings
          isConfigured={giphy.publicConfig !== null}
          isInherited={giphy.isInherited}
        />
        <MakeSettings
          isInherited={make.isInherited}
          publicConfig={make.publicConfig}
        />
      </div>
    </CredentialScopeProvider>
  )
}
