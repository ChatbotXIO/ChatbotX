import {
  anonymousClient,
  jwtClient,
  magicLinkClient,
  oneTimeTokenClient,
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

export { GENERIC_OAUTH_PROVIDER_ID } from "./oauth-constants"

export function createClient(baseURL?: string) {
  return createAuthClient({
    baseURL,
    plugins: [
      magicLinkClient(),
      oneTimeTokenClient(),
      anonymousClient(),
      jwtClient(),
    ],
  })
}
