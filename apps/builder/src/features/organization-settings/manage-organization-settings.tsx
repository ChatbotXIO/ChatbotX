import { organizationCredentialService } from "@chatbotx.io/business"
import { GiphySettings } from "./giphy/giphy-settings"
import { GoogleSettings } from "./google/google-settings"
import { InstagramSettings } from "./instagram/instagram-settings"
import { MessengerSettings } from "./messenger/messenger-settings"
import { StripeSettings } from "./stripe/stripe-settings"
import { WhatsappSettings } from "./whatsapp/whatsapp-settings"
import { ZaloSettings } from "./zalo/zalo-settings"

type ManageOrganizationSettingsProps = {
  organizationId: string
}

export async function ManageOrganizationSettings({
  organizationId,
}: ManageOrganizationSettingsProps) {
  const [whatsapp, messenger, instagram, google, zalo, giphy, stripe] =
    await Promise.all([
      organizationCredentialService.find({
        organizationId,
        type: "whatsapp",
      }),
      organizationCredentialService.find({
        organizationId,
        type: "messenger",
      }),
      organizationCredentialService.find({
        organizationId,
        type: "instagram",
      }),
      organizationCredentialService.find({
        organizationId,
        type: "google",
      }),
      organizationCredentialService.find({
        organizationId,
        type: "zalo",
      }),
      organizationCredentialService.find({
        organizationId,
        type: "giphy",
      }),
      organizationCredentialService.find({
        organizationId,
        type: "stripe",
      }),
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
