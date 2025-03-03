import { PrismaAdapter } from "@auth/prisma-adapter"
import { PrismaClient } from "@prisma/client"
import NextAuth, { type DefaultSession } from "next-auth"
import Nodemailer from "next-auth/providers/nodemailer"
import { providers } from "./auth.config"

declare module "next-auth" {
  /**
   * Returned by `auth`, `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      /** The user's id. */
      id: string

      /**
       * By default, TypeScript merges new interface properties and overwrites existing ones.
       * In this case, the default session user properties will be overwritten,
       * with the new ones defined above. To keep the default session user properties,
       * you need to add them back into the newly declared interface.
       */
    } & DefaultSession["user"]
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  debug: true,
  pages: {
    signIn: "/signin",
  },
  adapter: PrismaAdapter(new PrismaClient()),
  session: { strategy: "jwt" },
  providers: [
    ...providers,
    Nodemailer({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // User is available during sign-in
        token.id = user.id
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.sub ?? ""
      return session
    },
  },
})

export const getCurrentUserId = async (): Promise<string> => {
  const session = await auth()

  return session?.user.id || "unknown"
}
