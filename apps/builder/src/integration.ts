import { IntegrationType } from "@aha.chat/database"
import type { GoogleSheetsConfig } from "@aha.chat/integration-google-sheets"
import { integration as integrationGoogleSheets } from "@aha.chat/integration-google-sheets"
import { integration as integrationWhatsapp } from "@aha.chat/integration-whatsapp"

export const integrations = {
  [IntegrationType.WHATSAPP]: {
    getIntegrationConfig() {
      return {}
    },
    integration: integrationWhatsapp,
  },
  [IntegrationType.GOOGLE_SHEETS]: {
    getIntegrationConfig(
      stateParams?: GoogleSheetsConfig["stateParams"],
    ): GoogleSheetsConfig {
      return {
        clientId: process.env.AUTH_GOOGLE_ID ?? "",
        clientSecret: process.env.AUTH_GOOGLE_SECRET ?? "",
        redirectUri: `${process.env.BASE_URL}/integrations/google-sheets/callback`,
        stateParams,
      }
    },
    integration: integrationGoogleSheets,
  },
}

export type IntegrationKey = keyof typeof integrations
