import {
  anonymousClient,
  jwtClient,
  magicLinkClient,
  oneTimeTokenClient,
  organizationClient,
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

export function createClient(baseURL?: string) {
  return createAuthClient({
    baseURL,
    plugins: [
      organizationClient(),
      magicLinkClient(),
      oneTimeTokenClient(),
      anonymousClient(),
      jwtClient(),
    ],
  })
}
