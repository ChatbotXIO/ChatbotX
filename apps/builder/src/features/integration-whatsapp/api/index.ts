import { integrationWhatsappCoexistAPIs } from "./coexist"
import { integrationWhatsappConnectAPIs } from "./connect"
import { integrationWhatsappInternalAPIs } from "./private"
import { integrationWhatsappRoutingRolesAPIs } from "./routing-roles"

export const integrationWhatsappAPIs = {
  ...integrationWhatsappInternalAPIs,
  ...integrationWhatsappRoutingRolesAPIs,
  ...integrationWhatsappCoexistAPIs,
  ...integrationWhatsappConnectAPIs,
}
