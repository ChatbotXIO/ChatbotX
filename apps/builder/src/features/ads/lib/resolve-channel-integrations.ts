import type { AdsEligibleChannelType } from "@chatbotx.io/utils/channel"
import type {
  AdsSwitcherChannelIntegration,
  AdsSwitcherData,
} from "../queries/switcher"

/** Integrations for one concrete ads-eligible channel — populates the
 * account/integration select on the per-channel Ads dashboard page
 * (`/dashboard/ads/[channel]`). WhatsApp rows are labeled "name — phone"
 * (matching the old account switcher's display) since a workspace commonly
 * connects several numbers under similar names. */
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
        name: integration.displayPhoneNumber
          ? `${integration.name} — ${integration.displayPhoneNumber}`
          : integration.name,
      })),
    messenger: () => switcherData.messengerIntegrations,
    instagram: () => switcherData.instagramIntegrations,
  }
  return byChannel[channel]()
}
