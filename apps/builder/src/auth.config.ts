import type { NextAuthConfig } from "next-auth"
import { Provider } from "next-auth/providers"
import Google from "next-auth/providers/google"
import Facebook from "next-auth/providers/facebook"
// import Nodemailer from "next-auth/providers/nodemailer"

const providers: Provider[] = [
  Google,
  Facebook,
  // Nodemailer
]

export const providerMap = providers
  .map((provider) => {
    if (typeof provider === "function") {
      const providerData = provider()
      return {
        id: providerData.id,
        name: providerData.name,
      }
    } else {
      return {
        id: provider.id,
        name: provider.name
      }
    }
  })
  .filter((provider) => provider.id !== "credentials")

// Notice this is only an object, not a full Auth.js instance
export default {
  providers,
} satisfies NextAuthConfig
