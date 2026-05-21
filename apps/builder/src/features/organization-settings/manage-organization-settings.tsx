import { credentialService } from "@chatbotx.io/business"
import { GiphySettings } from "./giphy/giphy-settings"
import { GoogleSettings } from "./google/google-settings"
import { InstagramSettings } from "./instagram/instagram-settings"
import { MessengerSettings } from "./messenger/messenger-settings"
import { StripeSettings } from "./stripe/stripe-settings"
import { WhatsappSettings } from "./whatsapp/whatsapp-settings"
import { ZaloSettings } from "./zalo/zalo-settings"

type ManageOrganizationSettingsProps = {
  userId: string
}

export async function ManageOrganizationSettings({
  userId,
}: ManageOrganizationSettingsProps) {
  const [whatsapp, messenger, instagram, google, zalo, giphy, stripe] =
    await Promise.all([
      credentialService.findForUser({ userId, type: "whatsapp" }),
      credentialService.findForUser({ userId, type: "messenger" }),
      credentialService.findForUser({ userId, type: "instagram" }),
      credentialService.findForUser({ userId, type: "google" }),
      credentialService.findForUser({ userId, type: "zalo" }),
      credentialService.findForUser({ userId, type: "giphy" }),
      credentialService.findForUser({ userId, type: "stripe" }),
    ])

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
