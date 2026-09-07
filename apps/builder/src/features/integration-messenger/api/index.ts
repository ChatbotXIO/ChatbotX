import { integrationMessengerCoexistAPIs } from "./coexist"
import { integrationMessengerConnectAPIs } from "./connect"

export const integrationMessengerAPIs = {
  ...integrationMessengerCoexistAPIs,
  ...integrationMessengerConnectAPIs,
}
