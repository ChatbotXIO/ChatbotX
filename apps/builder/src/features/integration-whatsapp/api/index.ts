import { integrationWhatsappCoexistAPIs } from "./coexist"
import { integrationWhatsappConnectAPIs } from "./connect"
import { integrationWhatsappInternalAPIs } from "./private"

export const integrationWhatsappAPIs = {
  ...integrationWhatsappInternalAPIs,
  ...integrationWhatsappCoexistAPIs,
  ...integrationWhatsappConnectAPIs,
}
