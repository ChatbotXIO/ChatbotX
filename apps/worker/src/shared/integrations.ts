import type { IntegrationType } from "@aha.chat/database"
import { integration as integrationMessenger } from "@aha.chat/integration-messenger"
import { integration as integrationWhatsapp } from "@aha.chat/integration-whatsapp"
import { integration as integrationZalo } from "@aha.chat/integration-zalo"
import type { Integration, IntegrationDefinition } from "@aha.chat/sdk"

export const allIntegrations: Record<
  IntegrationType,
  // biome-ignore lint/suspicious/noExplicitAny: safe pass value
  Integration<IntegrationDefinition<any, any, any>> | undefined
> = {
  GEMINI: undefined,
  GOOGLE_SHEETS: undefined,
  INSTAGRAM: undefined,
  MESSENGER: integrationMessenger,
  OPENAI: undefined,
  WEBCHAT: undefined,
  WHATSAPP: integrationWhatsapp,
  ZALO: integrationZalo,
}
