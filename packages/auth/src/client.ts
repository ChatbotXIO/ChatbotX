import {
  anonymousClient,
  jwtClient,
  magicLinkClient,
  oneTimeTokenClient,
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

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
