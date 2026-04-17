import { createAuth } from "@chatbotx.io/auth/server"
import { env } from "@/env"

export const auth = createAuth({
  brandUrl: env.NEXT_PUBLIC_BUILDER_URL,
  google:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        }
      : undefined,
})
