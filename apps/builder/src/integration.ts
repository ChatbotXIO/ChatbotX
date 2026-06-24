import { integration as integrationActiveCampaign } from "@chatbotx.io/integration-active-campaign"
import { integration as integrationChatbotx } from "@chatbotx.io/integration-chatbotx"
import { integration as integrationDrip } from "@chatbotx.io/integration-drip"
import { integration as integrationGetResponse } from "@chatbotx.io/integration-get-response"
import { integration as integrationGoogleSheets } from "@chatbotx.io/integration-google-sheets"
import { integration as integrationInstagram } from "@chatbotx.io/integration-instagram"
import { integration as integrationInstagramFacebook } from "@chatbotx.io/integration-instagram-facebook"
import { integration as integrationKlaviyo } from "@chatbotx.io/integration-klaviyo"
import { integration as integrationMailchimp } from "@chatbotx.io/integration-mailchimp"
import { integration as integrationMailerLite } from "@chatbotx.io/integration-mailer-lite"
import { integration as integrationMessenger } from "@chatbotx.io/integration-messenger"
import { integration as integrationMoosend } from "@chatbotx.io/integration-moosend"
import { integration as integrationSendGrid } from "@chatbotx.io/integration-sendgrid"
import { integration as integrationSmtp } from "@chatbotx.io/integration-smtp"
import { integration as integrationTelegram } from "@chatbotx.io/integration-telegram"
import { integration as integrationTiktok } from "@chatbotx.io/integration-tiktok"
import { integration as integrationWebchat } from "@chatbotx.io/integration-webchat"
import { integration as integrationWhatsapp } from "@chatbotx.io/integration-whatsapp"
import { integration as integrationZalo } from "@chatbotx.io/integration-zalo"

export const integrations = {
  whatsapp: integrationWhatsapp,
  messenger: integrationMessenger,
  instagram: integrationInstagram,
  instagramFacebook: integrationInstagramFacebook,
  activeCampaign: integrationActiveCampaign,
  drip: integrationDrip,
  getResponse: integrationGetResponse,
  klaviyo: integrationKlaviyo,
  mailchimp: integrationMailchimp,
  mailerLite: integrationMailerLite,
  moosend: integrationMoosend,
  googleSheets: integrationGoogleSheets,
  zalo: integrationZalo,
  telegram: integrationTelegram,
  tiktok: integrationTiktok,
  webchat: integrationWebchat,
  chatbotx: integrationChatbotx,
  smtp: integrationSmtp,
  sendGrid: integrationSendGrid,
}

export type IntegrationKey = keyof typeof integrations
