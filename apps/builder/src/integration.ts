import { IntegrationType } from "@aha.chat/database"
import { integration as integrationGoogleSheets } from "@aha.chat/integration-google-sheets"
import { integration as integrationMessenger } from "@aha.chat/integration-messenger"
import { integration as integrationWhatsapp } from "@aha.chat/integration-whatsapp"
import { integration as integrationZalo } from "@aha.chat/integration-zalo"

export const integrations = {
  [IntegrationType.WHATSAPP]: integrationWhatsapp,
  [IntegrationType.MESSENGER]: integrationMessenger,
  [IntegrationType.GOOGLE_SHEETS]: integrationGoogleSheets,
  [IntegrationType.ZALO]: integrationZalo,
}

export type IntegrationKey = keyof typeof integrations
