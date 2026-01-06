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
}

export type IntegrationKey = keyof typeof integrations
