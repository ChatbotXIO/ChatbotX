import { createAuthClient } from "better-auth/react"
import { magicLinkClient, oneTimeTokenClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  plugins: [magicLinkClient(), oneTimeTokenClient()],
})
