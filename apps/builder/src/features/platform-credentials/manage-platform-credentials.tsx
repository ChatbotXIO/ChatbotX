import { platformCredentialService } from "@chatbotx.io/business"
import { isCloud } from "@/env"
import { GiphySettings } from "./giphy/giphy-settings"
import { GoogleSettings } from "./google/google-settings"
import { InstagramSettings } from "./instagram/instagram-settings"
import { MessengerSettings } from "./messenger/messenger-settings"
import { StripeSettings } from "./stripe/stripe-settings"
import { WhatsappSettings } from "./whatsapp/whatsapp-settings"
import { ZaloSettings } from "./zalo/zalo-settings"

type ManagePlatformCredentialsProps = {
  userId: string
}

export async function ManagePlatformCredentials({
  userId,
}: ManagePlatformCredentialsProps) {
  const scopedUserId = isCloud() ? userId : undefined

  const [
    whatsappResult,
    messengerResult,
    instagramResult,
    googleResult,
    zaloResult,
    giphyResult,
    stripeResult,
  ] = await Promise.allSettled([
    platformCredentialService.find({ userId: scopedUserId, type: "whatsapp" }),
    platformCredentialService.find({ userId: scopedUserId, type: "messenger" }),
    platformCredentialService.find({ userId: scopedUserId, type: "instagram" }),
    platformCredentialService.find({ userId: scopedUserId, type: "google" }),
    platformCredentialService.find({ userId: scopedUserId, type: "zalo" }),
    platformCredentialService.find({ userId: scopedUserId, type: "giphy" }),
    platformCredentialService.find({ userId: scopedUserId, type: "stripe" }),
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
  const stripe =
    stripeResult.status === "fulfilled" ? stripeResult.value : undefined

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <MessengerSettings publicConfig={messenger?.publicConfig ?? null} />
      <InstagramSettings publicConfig={instagram?.publicConfig ?? null} />
      <GoogleSettings publicConfig={google?.publicConfig ?? null} />
      <StripeSettings publicConfig={stripe?.publicConfig ?? null} />
      <WhatsappSettings publicConfig={whatsapp?.publicConfig ?? null} />
      <ZaloSettings publicConfig={zalo?.publicConfig ?? null} />
      <GiphySettings isConfigured={giphy !== undefined} />
    </div>
  )
}
