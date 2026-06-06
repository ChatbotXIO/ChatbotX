import { platformCredentialService } from "@chatbotx.io/business"
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
    // stripeResult,
    tiktokResult,
  ] = await Promise.allSettled([
    platformCredentialService.find({ userId: scopedUserId, type: "whatsapp" }),
    platformCredentialService.find({ userId: scopedUserId, type: "messenger" }),
    platformCredentialService.find({ userId: scopedUserId, type: "instagram" }),
    platformCredentialService.find({ userId: scopedUserId, type: "google" }),
    platformCredentialService.find({ userId: scopedUserId, type: "zalo" }),
    platformCredentialService.find({ userId: scopedUserId, type: "giphy" }),
    // platformCredentialService.find({ userId: scopedUserId, type: "stripe" }),
    platformCredentialService.find({ userId: scopedUserId, type: "tiktok" }),
  ])
  const whatsapp =
    whatsappResult.status === "fulfilled" ? whatsappResult.value : undefined
  const messenger =
    messengerResult.status === "fulfilled" ? messengerResult.value : undefined
  const instagram =
    instagramResult.status === "fulfilled" ? instagramResult.value : undefined
  const google =
    googleResult.status === "fulfilled" ? googleResult.value : undefined
  const zalo = zaloResult.status === "fulfilled" ? zaloResult.value : undefined
  const giphy =
    giphyResult.status === "fulfilled" ? giphyResult.value : undefined
  // const stripe =
  //   stripeResult.status === "fulfilled" ? stripeResult.value : undefined
  const tiktok =
    tiktokResult.status === "fulfilled" ? tiktokResult.value : undefined

  return (
    <CredentialScopeProvider scope={scope}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <MessengerSettings publicConfig={messenger?.publicConfig ?? null} />
        <InstagramSettings publicConfig={instagram?.publicConfig ?? null} />
        <GoogleSettings publicConfig={google?.publicConfig ?? null} />
        {/* <StripeSettings publicConfig={stripe?.publicConfig ?? null} /> */}
        <WhatsappSettings publicConfig={whatsapp?.publicConfig ?? null} />
        <ZaloSettings publicConfig={zalo?.publicConfig ?? null} />
        <TiktokSettings publicConfig={tiktok?.publicConfig ?? null} />
        <GiphySettings isConfigured={giphy !== undefined} />
      </div>
    </CredentialScopeProvider>
  )
}
