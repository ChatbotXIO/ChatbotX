import { integrationInstagramCoexistAPIs } from "./coexist"
import { integrationInstagramConnectAPIs } from "./connect"

export const integrationInstagramAPIs = {
  ...integrationInstagramCoexistAPIs,
  ...integrationInstagramConnectAPIs,
}
