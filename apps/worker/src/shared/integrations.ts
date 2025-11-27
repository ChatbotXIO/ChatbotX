import type { IntegrationType } from "@aha.chat/database/types"
import { integration as integrationGoogleSheets } from "@aha.chat/integration-google-sheets"
import { integration as integrationMessenger } from "@aha.chat/integration-messenger"
import { integration as integrationWhatsapp } from "@aha.chat/integration-whatsapp"
import { integration as integrationZalo } from "@aha.chat/integration-zalo"
import type { Integration, IntegrationDefinition } from "@aha.chat/sdk"

export const allIntegrations: Record<
  IntegrationType,
  // biome-ignore lint/suspicious/noExplicitAny: safe pass value
  Integration<IntegrationDefinition<any, any, any>> | undefined
> = {
  gemini: undefined,
  googleSheets: integrationGoogleSheets,
  messenger: integrationMessenger,
  openai: undefined,
  webchat: undefined,
  whatsapp: integrationWhatsapp,
  zalo: integrationZalo,
}
