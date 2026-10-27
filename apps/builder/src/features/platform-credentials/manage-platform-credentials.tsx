import {
  hasPlatformStripeWebhook,
  platformCredentialService,
  tenantService,
} from "@chatbotx.io/business"
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
import { GoogleAdsSettings } from "./google-ads/google-ads-settings"
import { InstagramSettings } from "./instagram/instagram-settings"
import { InstagramFacebookSettings } from "./instagram-facebook/instagram-facebook-settings"
import { MakeSettings } from "./make/make-settings"
import { MessengerSettings } from "./messenger/messenger-settings"
import { CredentialScopeProvider } from "./provider/credential-scope-context"
import type { CredentialScope } from "./scope"
import { StripeSettings } from "./stripe/stripe-settings"
import { ThreadsSettings } from "./threads/threads-settings"
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
  credentialId?: string
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
    const publicConfig = await platformCredentialService.findPlatformPublic({
      type,
    })
    return { publicConfig: publicConfig ?? null, isInherited: false }
  }

  const resolved = await platformCredentialService.resolvePublicForUser({
    userId: scopedUserId,
    type,
  })
  if (resolved?.isInherited) {
    return { publicConfig: null, isInherited: true }
  }
  return {
    credentialId: resolved?.credentialId,
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
    threadsResult,
    googleResult,
    googleAdsResult,
    zaloResult,
    giphyResult,
    tiktokResult,
    makeResult,
    stripeResult,
    stripeWebhookResult,
  ] = await Promise.allSettled([
    resolveCard(scopedUserId, "whatsapp"),
    resolveCard(scopedUserId, "messenger"),
    resolveCard(scopedUserId, "instagram"),
    resolveCard(scopedUserId, "instagramFacebook"),
    resolveCard(scopedUserId, "threads"),
    resolveCard(scopedUserId, "google"),
    resolveCard(scopedUserId, "googleAds"),
    resolveCard(scopedUserId, "zalo"),
    resolveCard(scopedUserId, "giphy"),
    resolveCard(scopedUserId, "tiktok"),
    resolveCard(scopedUserId, "make"),
    resolveCard(scopedUserId, "stripe"),
    hasPlatformStripeWebhook({ userId: scopedUserId }),
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
  const threads =
    threadsResult.status === "fulfilled" ? threadsResult.value : emptyCard
  const google =
    googleResult.status === "fulfilled" ? googleResult.value : emptyCard
  const googleAds =
    googleAdsResult.status === "fulfilled" ? googleAdsResult.value : emptyCard
  const zalo = zaloResult.status === "fulfilled" ? zaloResult.value : emptyCard
  const giphy =
    giphyResult.status === "fulfilled" ? giphyResult.value : emptyCard
  const tiktok =
    tiktokResult.status === "fulfilled" ? tiktokResult.value : emptyCard
  const make = makeResult.status === "fulfilled" ? makeResult.value : emptyCard
  const stripe =
    stripeResult.status === "fulfilled" ? stripeResult.value : emptyCard
  const hasStripeWebhook =
    stripeWebhookResult.status === "fulfilled" && stripeWebhookResult.value

  // Tenant-owned credentials use the reseller's custom domain. Entitled users
  // without an active tenant use the broker for callbacks and credential-scoped
  // webhooks; OAuth callback state already binds the connection to its owner.
  const brokerOrigin = getBrokerOrigin()
  const [customDomainOrigin, tenant] = scopedUserId
    ? await Promise.all([
        resolveTenantCustomDomainOrigin(scopedUserId),
        tenantService.findByOwner(scopedUserId),
      ])
    : [undefined, undefined]
  const hasActiveTenant = tenant?.status === "active"
  const tenantOrigin = customDomainOrigin ?? PLACEHOLDER_DOMAIN_ORIGIN
  const callbackOriginFor = (isInherited: boolean) =>
    isInherited || !hasActiveTenant ? brokerOrigin : tenantOrigin
  const webhookUrlFor = <T extends CredentialType>(
    type: T,
    credential: ResolvedCredential<T>,
  ) =>
    credential.credentialId && !hasActiveTenant
      ? `${brokerOrigin}/integrations/${type}/webhook/c/${credential.credentialId}`
      : `${callbackOriginFor(credential.isInherited)}/integrations/${type}/webhook`

  return (
    <CredentialScopeProvider scope={scope}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MessengerSettings
          callbackOrigin={callbackOriginFor(messenger.isInherited)}
          isInherited={messenger.isInherited}
          publicConfig={messenger.publicConfig}
          webhookUrl={webhookUrlFor("messenger", messenger)}
        />
        <InstagramSettings
          callbackOrigin={callbackOriginFor(instagram.isInherited)}
          isInherited={instagram.isInherited}
          publicConfig={instagram.publicConfig}
          webhookUrl={webhookUrlFor("instagram", instagram)}
        />
        <InstagramFacebookSettings
          callbackOrigin={callbackOriginFor(instagramFacebook.isInherited)}
          isInherited={instagramFacebook.isInherited}
          publicConfig={instagramFacebook.publicConfig}
          webhookUrl={webhookUrlFor("instagramFacebook", instagramFacebook)}
        />
        <ThreadsSettings
          callbackOrigin={callbackOriginFor(threads.isInherited)}
          isInherited={threads.isInherited}
          publicConfig={threads.publicConfig}
        />
        <GoogleSettings
          callbackOrigin={callbackOriginFor(google.isInherited)}
          isInherited={google.isInherited}
          publicConfig={google.publicConfig}
        />
        <GoogleAdsSettings
          callbackOrigin={callbackOriginFor(googleAds.isInherited)}
          isInherited={googleAds.isInherited}
          publicConfig={googleAds.publicConfig}
        />
        <WhatsappSettings
          callbackOrigin={callbackOriginFor(whatsapp.isInherited)}
          isInherited={whatsapp.isInherited}
          publicConfig={whatsapp.publicConfig}
          webhookUrl={webhookUrlFor("whatsapp", whatsapp)}
        />
        <ZaloSettings
          callbackOrigin={callbackOriginFor(zalo.isInherited)}
          isInherited={zalo.isInherited}
          publicConfig={zalo.publicConfig}
          webhookUrl={webhookUrlFor("zalo", zalo)}
        />
        <TiktokSettings
          callbackOrigin={callbackOriginFor(tiktok.isInherited)}
          isInherited={tiktok.isInherited}
          publicConfig={tiktok.publicConfig}
          webhookUrl={webhookUrlFor("tiktok", tiktok)}
        />
        <GiphySettings
          isConfigured={giphy.publicConfig !== null}
          isInherited={giphy.isInherited}
        />
        <MakeSettings
          isInherited={make.isInherited}
          publicConfig={make.publicConfig}
        />
        <StripeSettings
          callbackOrigin={callbackOriginFor(stripe.isInherited)}
          hasConnectWebhook={hasStripeWebhook}
          isInherited={stripe.isInherited}
          publicConfig={stripe.publicConfig}
        />
      </div>
    </CredentialScopeProvider>
  )
}
