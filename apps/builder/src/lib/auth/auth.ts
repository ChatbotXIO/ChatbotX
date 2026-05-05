import { createAuth } from "@chatbotx.io/auth/server"
import { env } from "@/env"

export const auth = createAuth({
  brandUrl: env.NEXT_PUBLIC_BUILDER_URL,
})
