import { createAuthClient } from "better-auth/react"
import { magicLinkClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  // baseURL: process.env.BASE_URL as string,
  plugins: [
    magicLinkClient(),
    // adminClient(),
    // organizationClient(),
  ],
})
