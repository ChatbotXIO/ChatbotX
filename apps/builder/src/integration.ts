import { IntegrationType } from "@ahachat.ai/database"
import { integration as integrationGoogleSheets } from "@ahachat.ai/integration-google-sheets"
import type { GoogleSheetsConfig } from "@ahachat.ai/integration-google-sheets"
import { integration as integrationWhatsapp } from "@ahachat.ai/integration-whatsapp"

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
