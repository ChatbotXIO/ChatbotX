import type { IntegrationType } from "@aha.chat/database/types"
import { integration as integrationMessenger } from "@aha.chat/integration-messenger"
import { integration as integrationWhatsapp } from "@aha.chat/integration-whatsapp"
import { integration as integrationZalo } from "@aha.chat/integration-zalo"
import type { Integration, IntegrationDefinition } from "@aha.chat/sdk"

export const allIntegrations: Record<
  IntegrationType,
  // biome-ignore lint/suspicious/noExplicitAny: safe pass value
  Integration<IntegrationDefinition<any, any, any>> | undefined
> = {
  Gemini: undefined,
  GoogleSheets: undefined,
  Messenger: integrationMessenger,
  OpenAI: undefined,
  Webchat: undefined,
  Whatsapp: integrationWhatsapp,
  Zalo: integrationZalo,
}
