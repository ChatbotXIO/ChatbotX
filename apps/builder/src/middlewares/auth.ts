import { db } from "@chatbotx.io/database/client"
import { ORPCError } from "@orpc/server"
import { auth } from "@/lib/auth/auth"
import { base } from "./context"

export const authMiddleware = base.middleware(async ({ context, next }) => {
  const sessionData = await auth.api.getSession({
    headers: context.headers,
  })

  if (!(sessionData?.session && sessionData?.user)) {
    throw new ORPCError("UNAUTHORIZED")
  }

  // Adds session and user to the context
  return next({
    context: {
      session: sessionData.session,
      user: {
        ...sessionData.user,
        image: sessionData.user.image || null,
        isAnonymous: sessionData.user.isAnonymous ?? false,
        // stripeCustomerId: sessionData.user.stripeCustomerId || null,
      },
    },
  })
})

export const workspaceAuthorizedMidddleware = base.middleware(
  async ({ context, next }, workspaceId: string) => {
    if (!context.user) {
      throw new ORPCError("UNAUTHORIZED")
    }

    const workspaceMember = await db.query.workspaceMemberModel.findFirst({
      where: {
        workspaceId,
        userId: context.user.id,
      },
      with: {
        workspace: true,
      },
    })

    if (!workspaceMember) {
      throw new ORPCError("UNAUTHORIZED")
    }

    return next({
      context: {
        workspace: workspaceMember.workspace,
      },
    })
  },
)
