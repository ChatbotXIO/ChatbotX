import {
  type OrganizationModel,
  organizationSettingsSchema,
} from "@aha.chat/database/types"
import { GiphySettings } from "./giphy/giphy-settings"
import { GoogleSettings } from "./google/google-settings"
import { MessengerSettings } from "./messenger/messenger-settings"
import { StripeSettings } from "./stripe/stripe-settings"
import { WhatsappSettings } from "./whatsapp/whatsapp-settings"
import { ZaloSettings } from "./zalo/zalo-settings"

type ManageOrganizationSettingsProps = {
  organization: OrganizationModel
}

export function ManageOrganizationSettings({
  organization,
}: ManageOrganizationSettingsProps) {
  const organizationSetting = organizationSettingsSchema.parse(
    organization.settings,
  )

  return (
    <div className="flex flex-wrap gap-4">
      <MessengerSettings config={organizationSetting.messenger} />
      <GoogleSettings config={organizationSetting.google} />
      <StripeSettings config={organizationSetting.stripe} />
      <WhatsappSettings config={organizationSetting.whatsapp} />
      <ZaloSettings config={organizationSetting.zalo} />
      <GiphySettings config={organizationSetting.giphy} />
    </div>
  )
}
