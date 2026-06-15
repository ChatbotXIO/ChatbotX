import { platformCredentialService } from "@chatbotx.io/business"
import type {
  CredentialPublicByType,
  CredentialType,
} from "@chatbotx.io/database/partials"
import { isCloud } from "@/env"
import { GiphySettings } from "./giphy/giphy-settings"
import { GoogleSettings } from "./google/google-settings"
import { InstagramSettings } from "./instagram/instagram-settings"
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
    googleResult,
    zaloResult,
    giphyResult,
    tiktokResult,
  ] = await Promise.allSettled([
    resolveCard(scopedUserId, "whatsapp"),
    resolveCard(scopedUserId, "messenger"),
    resolveCard(scopedUserId, "instagram"),
    resolveCard(scopedUserId, "google"),
    resolveCard(scopedUserId, "zalo"),
    resolveCard(scopedUserId, "giphy"),
    resolveCard(scopedUserId, "tiktok"),
  ])

  const emptyCard = { publicConfig: null, isInherited: false } as const
  const whatsapp =
    whatsappResult.status === "fulfilled" ? whatsappResult.value : emptyCard
  const messenger =
    messengerResult.status === "fulfilled" ? messengerResult.value : emptyCard
  const instagram =
    instagramResult.status === "fulfilled" ? instagramResult.value : emptyCard
  const google =
    googleResult.status === "fulfilled" ? googleResult.value : emptyCard
  const zalo = zaloResult.status === "fulfilled" ? zaloResult.value : emptyCard
  const giphy =
    giphyResult.status === "fulfilled" ? giphyResult.value : emptyCard
  const tiktok =
    tiktokResult.status === "fulfilled" ? tiktokResult.value : emptyCard

  return (
    <CredentialScopeProvider scope={scope}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MessengerSettings
          isInherited={messenger.isInherited}
          publicConfig={messenger.publicConfig}
        />
        <InstagramSettings
          isInherited={instagram.isInherited}
          publicConfig={instagram.publicConfig}
        />
        <GoogleSettings
          isInherited={google.isInherited}
          publicConfig={google.publicConfig}
        />
        <WhatsappSettings
          isInherited={whatsapp.isInherited}
          publicConfig={whatsapp.publicConfig}
        />
        <ZaloSettings
          isInherited={zalo.isInherited}
          publicConfig={zalo.publicConfig}
        />
        <TiktokSettings
          isInherited={tiktok.isInherited}
          publicConfig={tiktok.publicConfig}
        />
        <GiphySettings
          isConfigured={giphy.publicConfig !== null}
          isInherited={giphy.isInherited}
        />
      </div>
    </CredentialScopeProvider>
  )
}
