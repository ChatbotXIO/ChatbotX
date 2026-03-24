import { integration as integrationChatbotx } from "@chatbotx.io/integration-chatbotx"
import { integration as integrationGoogleSheets } from "@chatbotx.io/integration-google-sheets"
import { integration as integrationInstagram } from "@chatbotx.io/integration-instagram"
import { integration as integrationMessenger } from "@chatbotx.io/integration-messenger"
import { integration as integrationSmtp } from "@chatbotx.io/integration-smtp"
import { integration as integrationTelegram } from "@chatbotx.io/integration-telegram"
import { integration as integrationWebchat } from "@chatbotx.io/integration-webchat"
import { integration as integrationWhatsapp } from "@chatbotx.io/integration-whatsapp"
import { integration as integrationZalo } from "@chatbotx.io/integration-zalo"

export const integrations = {
  whatsapp: integrationWhatsapp,
  messenger: integrationMessenger,
  instagram: integrationInstagram,
  googleSheets: integrationGoogleSheets,
  zalo: integrationZalo,
  telegram: integrationTelegram,
  webchat: integrationWebchat,
  chatbotx: integrationChatbotx,
  smtp: integrationSmtp,
}

export type IntegrationKey = keyof typeof integrations
