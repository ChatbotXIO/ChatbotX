import { integration as integrationActiveCampaign } from "@aha.chat/integration-active-campaign"
import { integration as integrationDrip } from "@aha.chat/integration-drip"
import { integration as integrationGoogleSheets } from "@aha.chat/integration-google-sheets"
import { integration as integrationMailchimp } from "@aha.chat/integration-mailchimp"
import { integration as integrationMessenger } from "@aha.chat/integration-messenger"
import { integration as integrationWhatsapp } from "@aha.chat/integration-whatsapp"
import { integration as integrationZalo } from "@aha.chat/integration-zalo"

export const integrations = {
  whatsapp: integrationWhatsapp,
  messenger: integrationMessenger,
  googleSheets: integrationGoogleSheets,
  mailchimp: integrationMailchimp,
  zalo: integrationZalo,
  activeCampaign: integrationActiveCampaign,
  drip: integrationDrip,
}

export type IntegrationKey = keyof typeof integrations
