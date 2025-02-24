import { integration as integrationGoogleSheets } from "@ahachat.ai/integration-google-sheets"
import { integration as integrationWhatsapp } from "@ahachat.ai/integration-whatsapp"

export const integrations = {
  whatsapp: integrationWhatsapp,
  // googleSheets: integrationGoogleSheets,
}

export type IntegrationKey = keyof typeof integrations
