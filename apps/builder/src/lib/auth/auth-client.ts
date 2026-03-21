import {
  anonymousClient,
  jwtClient,
  magicLinkClient,
  oneTimeTokenClient,
  organizationClient,
} from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({
  plugins: [
    organizationClient(),
    magicLinkClient(),
    oneTimeTokenClient(),
    anonymousClient(),
    jwtClient(),
    // stripeClient({
    //   subscription: true,
    // }),
  ],
})
