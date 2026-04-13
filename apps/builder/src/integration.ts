import { integration as integrationChatbotx } from "@chatbotx.io/integration-chatbotx"
import { integration as integrationGoogleSheets } from "@chatbotx.io/integration-google-sheets"
import { integration as integrationMessenger } from "@chatbotx.io/integration-messenger"
import { integration as integrationSmtp } from "@chatbotx.io/integration-smtp"
import { integration as integrationWebchat } from "@chatbotx.io/integration-webchat"
import { integration as integrationWhatsapp } from "@chatbotx.io/integration-whatsapp"
import { integration as integrationZalo } from "@chatbotx.io/integration-zalo"

export const integrations = {
  whatsapp: integrationWhatsapp,
  messenger: integrationMessenger,
  googleSheets: integrationGoogleSheets,
  zalo: integrationZalo,
  webchat: integrationWebchat,
  chatbotx: integrationChatbotx,
  smtp: integrationSmtp,
}

export type IntegrationKey = keyof typeof integrations
