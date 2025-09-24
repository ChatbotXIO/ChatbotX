import { integration as integrationGoogleSheets } from "@aha.chat/integration-google-sheets"
import { integration as integrationMessenger } from "@aha.chat/integration-messenger"
import { integration as integrationWhatsapp } from "@aha.chat/integration-whatsapp"
import { integration as integrationZalo } from "@aha.chat/integration-zalo"

export const integrations = {
  WHATSAPP: integrationWhatsapp,
  MESSENGER: integrationMessenger,
  GOOGLE_SHEETS: integrationGoogleSheets,
  ZALO: integrationZalo,
  WEBCHAT: undefined,
  INSTAGRAM: undefined,
  OPENAI: undefined,
  GEMINI: undefined,
}

export type IntegrationKey = keyof typeof integrations
