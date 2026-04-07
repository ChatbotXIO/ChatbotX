import { integration as integrationChatbotx } from "@aha.chat/integration-chatbotx"
import { integration as integrationGoogleSheets } from "@aha.chat/integration-google-sheets"
import { integration as integrationMessenger } from "@aha.chat/integration-messenger"
import { integration as integrationTelegram } from "@aha.chat/integration-telegram"
import { integration as integrationWebchat } from "@aha.chat/integration-webchat"
import { integration as integrationWhatsapp } from "@aha.chat/integration-whatsapp"
import { integration as integrationZalo } from "@aha.chat/integration-zalo"

export const integrations = {
  whatsapp: integrationWhatsapp,
  messenger: integrationMessenger,
  googleSheets: integrationGoogleSheets,
  zalo: integrationZalo,
  telegram: integrationTelegram,
  webchat: integrationWebchat,
  chatbotx: integrationChatbotx,
}

export type IntegrationKey = keyof typeof integrations
