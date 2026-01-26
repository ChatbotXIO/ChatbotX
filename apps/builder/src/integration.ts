import { integration as integrationActiveCampaign } from "@aha.chat/integration-active-campaign"
import { integration as integrationDrip } from "@aha.chat/integration-drip"
import { integration as integrationGetResponse } from "@aha.chat/integration-get-response"
import { integration as integrationGoogleSheets } from "@aha.chat/integration-google-sheets"
import { integration as integrationMailchimp } from "@aha.chat/integration-mailchimp"
import { integration as integrationMailerLite } from "@aha.chat/integration-mailer-lite"
import { integration as integrationMessenger } from "@aha.chat/integration-messenger"
import { integration as integrationMoosend } from "@aha.chat/integration-moosend"
import { integration as integrationSendFox } from "@aha.chat/integration-send-fox"
import { integration as integrationSendgrid } from "@aha.chat/integration-sendgrid"
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
  sendgrid: integrationSendgrid,
  mailerLite: integrationMailerLite,
  getResponse: integrationGetResponse,
  sendFox: integrationSendFox,
  moosend: integrationMoosend,
}

export type IntegrationKey = keyof typeof integrations
