import type { NextAuthConfig } from "next-auth"
import type { Provider } from "next-auth/providers"
import Facebook from "next-auth/providers/facebook"
import Google from "next-auth/providers/google"

const providers: Provider[] = [Google, Facebook]

export const providerMap = providers
  .map((provider) => {
    if (typeof provider === "function") {
      const providerData = provider()
      return {
        id: providerData.id,
        name: providerData.name,
      }
    }

    return {
      id: provider.id,
      name: provider.name,
    }
  })
  .filter((provider) => provider.id !== "credentials")

// Notice this is only an object, not a full Auth.js instance
export default {
  providers,
} satisfies NextAuthConfig
