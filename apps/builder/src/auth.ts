import { PrismaAdapter } from "@auth/prisma-adapter"
import NextAuth, { type DefaultSession } from "next-auth"
import authConfig from "./auth.config"
import Nodemailer from "next-auth/providers/nodemailer"
import { prisma } from "@ahachat.ai/database"

const workspaceId =
  process.env.DEFAULT_WORKSPACE_ID ?? "b7p91mne1bjgd5buq8x0w51c"

const providers = [
  ...authConfig.providers,
  Nodemailer({
    server: process.env.EMAIL_SERVER,
    from: process.env.EMAIL_FROM,
  }),
]

function stripUndefined<T>(obj: T) {
  const data = {} as T
  for (const key in obj) if (obj[key] !== undefined) data[key] = obj[key]
  return { data }
}

declare module "next-auth" {
  /**
   * Returned by `auth`, `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      /** The user's id. */
      id: string

      workspaceId: string

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
  // session: {
  //   strategy: 'database',
  // },
  // pages: {
  //   signIn: "/login",
  // },
  adapter: {
    ...PrismaAdapter(prisma),
    getUserByEmail: (email) =>
      prisma.user.findUnique({
        where: { workspaceId_email: { email, workspaceId } },
      }),
    createUser: ({ id, ...data }) =>
      prisma.user.create(stripUndefined({ ...data, workspaceId })),

    // ({ id, ...input }) => {
    //   const input = { ...pickBy(, identity), workspaceId }
    //   prisma.user.create({ data: input )})
    // }),
  },
  // session: { strategy: "jwt" },
  ...authConfig,
  providers,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // User is available during sign-in
        token.id = user.id
        token.workspaceId = user.workspaceId
      }
      return token
    },
    session({ session, token }) {
      console.log("xxxxxx", session, token)
      session.user.id = token.sub ?? ""
      session.user.workspaceId = token.workspaceId as string
      return session
    },
  },
})

export const getCurrentUserId = async (): Promise<string> => {
  const session = await auth()

  return session?.user.id || "unknown"
}
