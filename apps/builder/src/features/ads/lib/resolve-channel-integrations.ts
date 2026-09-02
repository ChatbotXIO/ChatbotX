import type { AdsEligibleChannelType } from "@chatbotx.io/utils/channel"
import { formatWhatsappIntegrationLabel } from "@/features/integration-whatsapp/libs/integration-label"
import type {
  AdsSwitcherChannelIntegration,
  AdsSwitcherData,
} from "../queries/switcher"

/** Integrations for one concrete ads-eligible channel — populates the
 * account/integration select on the per-channel Ads dashboard page
 * (`/dashboard/ads/[channel]`). WhatsApp rows are labeled via
 * `formatWhatsappIntegrationLabel` ("name — phone"), the same label the
 * Click to Message Ads tool shows. */
export function resolveChannelIntegrations(
  channel: AdsEligibleChannelType,
  switcherData: AdsSwitcherData,
): AdsSwitcherChannelIntegration[] {
  const byChannel: Record<
    AdsEligibleChannelType,
    () => AdsSwitcherChannelIntegration[]
  > = {
    whatsapp: () =>
      switcherData.integrations.map((integration) => ({
        id: integration.id,
        name: formatWhatsappIntegrationLabel(integration),
      })),
    messenger: () => switcherData.messengerIntegrations,
    instagram: () => switcherData.instagramIntegrations,
  }
  return byChannel[channel]()
}
