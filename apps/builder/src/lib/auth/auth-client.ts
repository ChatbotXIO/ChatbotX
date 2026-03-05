import {
  anonymousClient,
  jwtClient,
  magicLinkClient,
  oneTimeTokenClient,
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    oneTimeTokenClient(),
    anonymousClient(),
    jwtClient(),
  ],
})
